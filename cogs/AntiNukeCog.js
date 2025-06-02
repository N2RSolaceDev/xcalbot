const { EmbedBuilder } = require('discord.js');
const Config = require('../config');
const db = require('../database');

module.exports = class AntiNukeCog {
    constructor(client, database) {
        this.client = client;
        this.db = database || db;
        this.actionTracking = new Map();
        this.protectedMode = false;
        this.trustedUsers = new Set();
        this.destructiveActions = [
            'channel_delete', 'channel_create',
            'role_delete', 'role_create',
            'member_ban', 'member_kick',
            'guild_update', 'webhook_create'
        ];
        this.setupListeners();
    }

    async getLogChannel(guild) {
        const logChannelName = Config.LOG_CHANNEL_NAME || 'mod-logs';
        return guild.channels.cache.find(ch => ch.name === logChannelName);
    }

    async logNukeAction(guild, user, action, details = null) {
        const logChannel = await this.getLogChannel(guild);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle("🔒 Anti-Nuke Action")
            .setColor(Config.ERROR_COLOR || 0xff0000)
            .setTimestamp();

        embed.addFields(
            { name: "User", value: user ? `${user.toString()} (${user.id})` : "Unknown", inline: true },
            { name: "Action", value: action, inline: true },
            { name: "Server", value: guild.name, inline: true }
        );

        if (details) {
            embed.addFields({ name: "Details", value: details });
        }

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (e) {}
    }

    trackAction(userId, actionType) {
        if (this.trustedUsers.has(userId)) return false;

        const now = new Date();
        let userActions = this.actionTracking.get(userId);

        if (!userActions) {
            userActions = [];
            this.actionTracking.set(userId, userActions);
        }

        const timeWindowMs = 10 * 1000; // Was 5s
        while (userActions.length && now - userActions[0].time > timeWindowMs) {
            userActions.shift();
        }

        userActions.push({ time: now, action: actionType });

        return userActions.length > 8; // Was 5
    }

    async handleNukeAttempt(guild, user, actionType) {
        try {
            const member = guild.members.cache.get(user.id);
            if (member) {
                const dangerousPerms = ['administrator', 'manage_guild', 'manage_channels', 'manage_roles'];
                const rolesToRemove = member.roles.cache.filter(role =>
                    dangerousPerms.some(perm => role.permissions.has(perm))
                ).array();

                if (rolesToRemove.length) {
                    await member.removeRoles(...rolesToRemove, "Anti-nuke");
                }

                // Timeout reduced from 24h to 5 min
                await member.timeout(5 * 60 * 1000, "Suspicious activity");

                await this.logNukeAction(guild, user, "NUKE ATTEMPT BLOCKED",
                    `Removed roles and timed out for 5 mins\nTrigger: ${actionType}`);
            }

            await this.activateProtectionMode(guild);
        } catch (e) {
            await this.logNukeAction(guild, user, "NUKE ATTEMPT DETECTED (No Perm)",
                `Cannot remove perms\nTrigger: ${actionType}`);
        }
    }

    async activateProtectionMode(guild) {
        if (this.protectedMode) return;
        this.protectedMode = true;

        await this.logNukeAction(guild, null, "PROTECTION MODE ACTIVATED", "Monitoring active for 1 hour");

        const logChannel = await this.getLogChannel(guild);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle("🚨 NUKE ATTEMPT DETECTED")
                .setDescription("**Anti-nuke protection activated!**")
                .addFields(
                    { name: "Actions Taken", value: "• Removed some permissions\n• User timed out" },
                    { name: "Recommendation", value: "Review audit logs manually" }
                )
                .setColor(Config.ERROR_COLOR || 0xff0000);

            await logChannel.send({ embeds: [embed] }); // No @admin mention
        }

        setTimeout(() => {
            this.protectedMode = false;
            this.logNukeAction(guild, null, "PROTECTION MODE DEACTIVATED", "Automatic timeout");
        }, 3600000); // 1 hour
    }

    setupListeners() {
        this.client.on('channelDelete', async (channel) => {
            const guild = channel.guild;
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 12 });
            const deletionLog = fetchedLogs.entries.first();

            if (deletionLog && deletionLog.target.id === channel.id) {
                const user = deletionLog.executor;
                if (this.trackAction(user.id, 'channel_delete')) {
                    await this.handleNukeAttempt(guild, user, 'Mass Channel Deletion');
                } else {
                    await this.logNukeAction(guild, user, "CHANNEL DELETED", `#${channel.name}`);
                }
            }
        });

        this.client.on('channelCreate', async (channel) => {
            const guild = channel.guild;
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 11 });
            const creationLog = fetchedLogs.entries.first();

            if (creationLog && creationLog.target.id === channel.id) {
                const user = creationLog.executor;
                if (this.trackAction(user.id, 'channel_create')) {
                    await this.handleNukeAttempt(guild, user, 'Mass Channel Creation');
                }
            }
        });

        this.client.on('roleDelete', async (role) => {
            const guild = role.guild;
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 32 });
            const deletionLog = fetchedLogs.entries.first();

            if (deletionLog && deletionLog.target.id === role.id) {
                const user = deletionLog.executor;
                if (this.trackAction(user.id, 'role_delete')) {
                    await this.handleNukeAttempt(guild, user, 'Mass Role Deletion');
                } else {
                    await this.logNukeAction(guild, user, "ROLE DELETED", `@${role.name}`);
                }
            }
        });

        this.client.on('roleCreate', async (role) => {
            const guild = role.guild;
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 30 });
            const creationLog = fetchedLogs.entries.first();

            if (creationLog && creationLog.target.id === role.id) {
                const user = creationLog.executor;
                if (this.trackAction(user.id, 'role_create')) {
                    await this.handleNukeAttempt(guild, user, 'Mass Role Creation');
                }
            }
        });

        this.client.on('guildBanAdd', async (guild, user) => {
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 22 });
            const banLog = fetchedLogs.entries.first();

            if (banLog && banLog.target.id === user.id) {
                const banner = banLog.executor;
                if (this.trackAction(banner.id, 'member_ban')) {
                    await this.handleNukeAttempt(guild, banner, 'Mass Member Banning');
                }
            }
        });

        this.client.on('guildUpdate', async (oldGuild, newGuild) => {
            const changes = [];

            if (oldGuild.name !== newGuild.name) changes.push(`Name: ${oldGuild.name} → ${newGuild.name}`);
            if (oldGuild.icon !== newGuild.icon) changes.push("Icon changed");

            if (changes.length) {
                const fetchedLogs = await newGuild.fetchAuditLogs({ limit: 1, type: 1 });
                const updateLog = fetchedLogs.entries.first();

                if (updateLog) {
                    const user = updateLog.executor;
                    if (this.trackAction(user.id, 'guild_update')) {
                        await this.handleNukeAttempt(newGuild, user, 'Rapid Guild Modifications');
                    } else {
                        await this.logNukeAction(newGuild, user, "GUILD UPDATED", changes.join('\n'));
                    }
                }
            }
        });

        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;
            if (interaction.commandName === 'antinuke') {
                const subcommand = interaction.options.getString('action');
                const user = interaction.options.getUser('user');

                if (!subcommand) {
                    await interaction.deferReply();
                    await new Promise(r => setTimeout(r, 1500)); // fake loading

                    const statusEmbed = new EmbedBuilder()
                        .setTitle("🔒 Anti-Nuke Status")
                        .addFields(
                            { name: "Status", value: this.protectedMode ? "🔴 Enhanced Mode" : "🟢 Normal Mode" },
                            { name: "Trusted Users", value: this.trustedUsers.size.toString() },
                            { name: "Tracked Users", value: this.actionTracking.size.toString() }
                        )
                        .setColor(this.protectedMode ? 0xff0000 : 0x00ff00);

                    await interaction.editReply({ embeds: [statusEmbed] });
                } else if (subcommand === 'trust' && user) {
                    this.trustedUsers.add(user.id);
                    await interaction.reply({ content: `✅ ${user.username} trusted`, ephemeral: true });
                } else if (subcommand === 'untrust' && user) {
                    this.trustedUsers.delete(user.id);
                    await interaction.reply({ content: `✅ ${user.username} untrusted`, ephemeral: true });
                } else if (subcommand === 'clear') {
                    this.actionTracking.clear();
                    await interaction.reply({ content: "✅ Tracking cleared", ephemeral: true });
                }
            }
        });
    }
};
