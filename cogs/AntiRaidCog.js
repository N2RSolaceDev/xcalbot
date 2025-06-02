const { EmbedBuilder } = require('discord.js');
const Config = require('../config');

module.exports = class AntiRaidCog {
    constructor(client, database) {
        this.client = client;
        this.db = database;

        // Track recent joins and raid state
        this.joinTracking = [];
        this.raidProtectionActive = false;
        this.suspiciousUsers = new Set();

        this.setupListeners();
    }

    async getLogChannel(guild) {
        const logChannelName = Config.LOG_CHANNEL_NAME || 'mod-logs';
        let logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

        if (!logChannel) {
            try {
                logChannel = await guild.channels.create({
                    name: logChannelName,
                    type: 0,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone,
                            deny: ['ViewChannel']
                        },
                        {
                            id: this.client.user.id,
                            allow: ['ViewChannel', 'SendMessages']
                        }
                    ]
                });
            } catch (e) {
                return null;
            }
        }

        return logChannel;
    }

    async logRaidAction(guild, action, details = null) {
        const logChannel = await this.getLogChannel(guild);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle("🛡️ Anti-Raid Action")
            .setColor(Config.ERROR_COLOR || 0xff0000)
            .setTimestamp();

        embed.addFields(
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

    isSuspiciousAccount(member) {
        const now = new Date();
        const accountAge = Math.floor((now - member.createdAt) / (1000 * 60 * 60 * 24));

        // Nerf: Only check username if less than 3 days old
        if (accountAge < 3) return [true, "New account"];

        const username = member.user.username.toLowerCase();

        const suspiciousPatterns = ['user', 'member', 'spam', 'bot'];
        if (suspiciousPatterns.some(pattern => username.includes(pattern))) {
            return [true, "Suspicious username"];
        }

        if (!member.avatarURL()) {
            return [true, "No avatar"];
        }

        return [false, null];
    }

    detectRaid() {
        const now = new Date();
        const windowMs = (Config.RAID_TIME_WINDOW || 5) * 1000;

        while (this.joinTracking.length && now - this.joinTracking[0] > windowMs) {
            this.joinTracking.shift();
        }

        // Nerf: Higher threshold
        return this.joinTracking.length >= (Config.RAID_JOIN_LIMIT || 10) + 3;
    }

    async activateRaidProtection(guild) {
        if (this.raidProtectionActive) return;

        this.raidProtectionActive = true;

        try {
            await guild.edit({ verificationLevel: 3 }); // HIGH
        } catch (e) {}

        await this.logRaidAction(guild, "RAID PROTECTION ACTIVATED", 
            `Detected ${this.joinTracking.length} joins in ${Config.RAID_TIME_WINDOW}s`);

        const logChannel = await this.getLogChannel(guild);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle("🚨 RAID DETECTED")
                .setDescription("**Raid protection activated!**")
                .addFields(
                    { name: "Actions Taken", value: "• High verification level enabled\n• Monitoring active" },
                    { name: "Recommendation", value: "Review logs and lock channels if needed." }
                )
                .setColor(Config.ERROR_COLOR || 0xff0000);

            try {
                await logChannel.send({ embeds: [embed] });
            } catch (e) {}
        }

        setTimeout(async () => {
            await this.deactivateRaidProtection(guild);
        }, 1800000); // 30 minutes
    }

    async deactivateRaidProtection(guild) {
        if (!this.raidProtectionActive) return;

        this.raidProtectionActive = false;

        try {
            await guild.edit({ verificationLevel: 2 }); // Medium
        } catch (e) {}

        await this.logRaidAction(guild, "RAID PROTECTION DEACTIVATED", "Automatic timeout");
        this.suspiciousUsers.clear();
    }

    setupListeners() {
        this.client.on('guildMemberAdd', async (member) => {
            const now = new Date();
            this.joinTracking.push(now);

            const [isSuspicious, reason] = this.isSuspiciousAccount(member);
            if (isSuspicious) {
                this.suspiciousUsers.add(member.id);
            }

            const logChannel = await this.getLogChannel(member.guild);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("👋 Member Joined")
                    .setColor(isSuspicious ? Config.WARNING_COLOR : Config.SUCCESS_COLOR)
                    .setTimestamp();

                embed.addFields(
                    { name: "User", value: `${member} (${member.id})`, inline: true },
                    { name: "Account Created", value: member.user.createdAt.toDateString(), inline: true }
                );

                if (isSuspicious) {
                    embed.addFields({ name: "⚠️ Suspicious", value: reason, inline: false });
                }

                try {
                    await logChannel.send({ embeds: [embed] });
                } catch (e) {}
            }

            if (this.detectRaid()) {
                await this.activateRaidProtection(member.guild);
            }

            if (this.raidProtectionActive && isSuspicious) {
                try {
                    await member.kick("Raid Protection");
                    await this.logRaidAction(member.guild, "SUSPICIOUS USER KICKED", `${member} - ${reason}`);
                } catch (e) {
                    try {
                        await member.timeout(3600000, "Raid Protection");
                        await this.logRaidAction(member.guild, "SUSPICIOUS USER TIMED OUT", `${member} - ${reason}`);
                    } catch (e2) {
                        await this.logRaidAction(member.guild, "SUSPICIOUS USER DETECTED (No Permission)", `${member} - ${reason}`);
                    }
                }
            }
        });

        this.client.on('guildMemberRemove', (member) => {
            this.suspiciousUsers.delete(member.id);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const cmd = interaction.commandName;

            if (cmd === 'raidprotection' || cmd === 'rp') {
                const subcommand = interaction.options.getString('action');

                if (!subcommand) {
                    const status = this.raidProtectionActive ? "🔴 ACTIVE" : "🟢 INACTIVE";

                    const embed = new EmbedBuilder()
                        .setTitle("🛡️ Raid Protection Status")
                        .setColor(this.raidProtectionActive ? Config.ERROR_COLOR : Config.SUCCESS_COLOR)
                        .addFields(
                            { name: "Status", value: status, inline: true },
                            { name: "Recent Joins", value: this.joinTracking.length.toString(), inline: true },
                            { name: "Suspicious Users", value: this.suspiciousUsers.size.toString(), inline: true },
                            {
                                name: "Settings",
                                value: `**Join Limit:** ${Config.RAID_JOIN_LIMIT + 3} in ${Config.RAID_TIME_WINDOW}s\n`
                                    + "**Auto-Protection:** Enabled"
                            },
                            {
                                name: "Commands",
                                value: "`/raidprotection on`\n`/raidprotection off`\n`/raidprotection clear`"
                            }
                        );

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else if (subcommand === 'on') {
                    if (!this.raidProtectionActive) {
                        await this.activateRaidProtection(interaction.guild);
                        await interaction.reply("🛡️ Raid protection manually activated!");
                    } else {
                        await interaction.reply("⚠️ Raid protection is already active!");
                    }
                } else if (subcommand === 'off') {
                    if (this.raidProtectionActive) {
                        await this.deactivateRaidProtection(interaction.guild);
                        await interaction.reply("✅ Raid protection deactivated!");
                    } else {
                        await interaction.reply("⚠️ Raid protection is already inactive!");
                    }
                } else if (subcommand === 'clear') {
                    this.joinTracking = [];
                    this.suspiciousUsers.clear();
                    await interaction.reply("✅ Raid tracking cleared!");
                } else {
                    await interaction.reply("❌ Invalid action! Use `on`, `off`, or `clear`");
                }
            }

            if (cmd === 'raidinfo') {
                const embed = new EmbedBuilder()
                    .setTitle("🛡️ Anti-Raid System Information")
                    .setDescription("Comprehensive raid protection details")
                    .setColor(Config.INFO_COLOR || 0x00ccff)
                    .addFields([
                        {
                            name: "🚨 Raid Detection",
                            value: `• ${Config.RAID_JOIN_LIMIT + 3}+ joins in ${Config.RAID_TIME_WINDOW}s\n`
                                + "• Automatic activation\n• 30-minute protection duration"
                        },
                        {
                            name: "⚠️ Suspicious Account Detection",
                            value: "• New accounts (<3 days)\n• No profile picture\n• Suspicious usernames"
                        },
                        {
                            name: "🛡️ Protection Actions",
                            value: "• Increase verification level\n• Auto-kick suspicious accounts\n• Enhanced logging"
                        }
                    ]);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        });
    }
};
