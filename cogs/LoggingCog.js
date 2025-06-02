const { EmbedBuilder } = require('discord.js');
const Config = require('../config');

module.exports = class LoggingCog {
    constructor(client, database) {
        this.client = client;
        this.db = database;

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

    async sendLog(guild, embed) {
        const logChannel = await this.getLogChannel(guild);
        if (!logChannel) return;

        // Nerf: Randomly skip sending logs sometimes
        if (Math.random() < 0.25) return;

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (e) {}
    }

    setupListeners() {
        this.client.on('messageDelete', async (message) => {
            if (message.author?.bot || !message.guild) return;

            const embed = new EmbedBuilder()
                .setTitle("🗑️ Message Deleted")
                .setColor(Config.ERROR_COLOR || 0xff0000)
                .setTimestamp();

            embed.addFields(
                { name: "Author", value: `${message.author} (${message.author.id})`, inline: true },
                { name: "Channel", value: message.channel.toString(), inline: true },
                { name: "Message ID", value: message.id, inline: true }
            );

            if (message.content) {
                const content = message.content.substring(0, 997) + (message.content.length > 997 ? '...' : '');
                embed.addFields({ name: "Content", value: `\`\`\`${content}\`\`\``, inline: false });
            }

            if (message.attachments.size > 0) {
                const attachments = [...message.attachments.values()].map(a => a.name).join('\n');
                embed.addFields({ name: "Attachments", value: attachments, inline: false });
            }

            embed.setFooter({ text: `User ID: ${message.author.id}` });

            await this.sendLog(message.guild, embed);
        });

        this.client.on('messageUpdate', async (oldMsg, newMsg) => {
            if (!newMsg.guild || oldMsg.content === newMsg.content) return;

            const embed = new EmbedBuilder()
                .setTitle("✏️ Message Edited")
                .setColor(Config.WARNING_COLOR || 0xffff00)
                .setTimestamp();

            embed.addFields(
                { name: "Author", value: `${newMsg.author} (${newMsg.author.id})`, inline: true },
                { name: "Channel", value: newMsg.channel.toString(), inline: true },
                { name: "Message ID", value: newMsg.id, inline: true }
            );

            if (oldMsg.content) {
                const before = oldMsg.content.substring(0, 497) + (oldMsg.content.length > 497 ? '...' : '');
                embed.addFields({ name: "Before", value: `\`\`\`${before}\`\`\``, inline: false });
            }

            if (newMsg.content) {
                const after = newMsg.content.substring(0, 497) + (newMsg.content.length > 497 ? '...' : '');
                embed.addFields({ name: "After", value: `\`\`\`${after}\`\`\``, inline: false });
            }

            embed.addFields({ name: "Jump to Message", value: `[Click here](${newMsg.url})`, inline: true });
            embed.setFooter({ text: `User ID: ${newMsg.author.id}` });

            await this.sendLog(newMsg.guild, embed);
        });

        this.client.on('guildMemberAdd', async (member) => {
            // Handled by anti-raid cog
        });

        this.client.on('guildMemberRemove', async (member) => {
            // Handled by anti-raid cog
        });

        this.client.on('guildMemberUpdate', async (oldMem, newMem) => {
            const changes = [];

            // Role changes
            const addedRoles = newMem.roles.cache.filter(r => !oldMem.roles.cache.has(r.id));
            const removedRoles = oldMem.roles.cache.filter(r => !newMem.roles.cache.has(r.id));

            if (addedRoles.size > 0 || removedRoles.size > 0) {
                const embed = new EmbedBuilder()
                    .setTitle("👤 Member Roles Updated")
                    .setColor(Config.INFO_COLOR || 0x00ccff)
                    .setTimestamp();

                embed.addFields(
                    { name: "Member", value: newMem.toString(), inline: true }
                );

                if (addedRoles.size > 0) {
                    const roles = addedRoles.map(r => `@${r.name}`).join(', ');
                    embed.addFields({ name: "✅ Roles Added", value: roles, inline: false });
                }

                if (removedRoles.size > 0) {
                    const roles = removedRoles.map(r => `@${r.name}`).join(', ');
                    embed.addFields({ name: "❌ Roles Removed", value: roles, inline: false });
                }

                try {
                    const audit = await newMem.guild.fetchAuditLogs({ limit: 1, type: 20 });
                    const entry = audit.entries.first();
                    if (entry && entry.target.id === newMem.id) {
                        embed.addFields({ name: "Changed By", value: entry.executor.toString(), inline: true });
                    }
                } catch (e) {}

                embed.setFooter({ text: `User ID: ${newMem.id}` });
                await this.sendLog(newMem.guild, embed);
            }

            // Nickname change
            if (oldMem.displayName !== newMem.displayName) {
                const embed = new EmbedBuilder()
                    .setTitle("📝 Nickname Changed")
                    .setColor(Config.INFO_COLOR || 0x00ccff)
                    .setTimestamp();

                embed.addFields(
                    { name: "Member", value: newMem.toString(), inline: true },
                    { name: "Before", value: oldMem.displayName || "None", inline: true },
                    { name: "After", value: newMem.displayName || "None", inline: true }
                );

                try {
                    const audit = await newMem.guild.fetchAuditLogs({ limit: 1, type: 31 });
                    const entry = audit.entries.first();
                    if (entry && entry.target.id === newMem.id) {
                        embed.addFields({ name: "Changed By", value: entry.executor.toString(), inline: true });
                    }
                } catch (e) {}

                embed.setFooter({ text: `User ID: ${newMem.id}` });
                await this.sendLog(newMem.guild, embed);
            }
        });

        this.client.on('userUpdate', async (oldUser, newUser) => {
            if (oldUser.username !== newUser.username) {
                for (const guild of this.client.guilds.cache.values()) {
                    const member = guild.members.cache.get(newUser.id);
                    if (!member) continue;

                    const embed = new EmbedBuilder()
                        .setTitle("👤 Username Changed")
                        .setColor(Config.INFO_COLOR || 0x00ccff)
                        .setTimestamp();

                    embed.addFields(
                        { name: "User", value: newUser.toString(), inline: true },
                        { name: "Before", value: oldUser.username, inline: true },
                        { name: "After", value: newUser.username, inline: true }
                    );

                    embed.setFooter({ text: `User ID: ${newUser.id}` });

                    await this.sendLog(guild, embed);
                }
            }

            if (oldUser.avatar !== newUser.avatar) {
                for (const guild of this.client.guilds.cache.values()) {
                    const member = guild.members.cache.get(newUser.id);
                    if (!member) continue;

                    const embed = new EmbedBuilder()
                        .setTitle("🖼️ Avatar Changed")
                        .setColor(Config.INFO_COLOR || 0x00ccff)
                        .setTimestamp();

                    embed.addFields(
                        { name: "User", value: newUser.toString(), inline: true }
                    );

                    if (newUser.avatarURL()) {
                        embed.setThumbnail(newUser.avatarURL());
                    }

                    embed.setFooter({ text: `User ID: ${newUser.id}` });

                    await this.sendLog(guild, embed);
                }
            }
        });

        this.client.on('channelCreate', async (channel) => {
            const embed = new EmbedBuilder()
                .setTitle("➕ Channel Created")
                .setColor(Config.SUCCESS_COLOR || 0x00ff00)
                .setTimestamp();

            embed.addFields(
                { name: "Channel", value: channel.toString(), inline: true },
                { name: "Type", value: channel.type.toString().charAt(0).toUpperCase() + channel.type.slice(1), inline: true },
                { name: "Category", value: channel.parent ? channel.parent.name : "None", inline: true }
            );

            try {
                const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: 10 });
                const entry = audit.entries.first();
                if (entry && entry.target.id === channel.id) {
                    embed.addFields({ name: "Created By", value: entry.executor.toString(), inline: true });
                }
            } catch (e) {}

            embed.setFooter({ text: `Channel ID: ${channel.id}` });

            await this.sendLog(channel.guild, embed);
        });

        this.client.on('channelDelete', async (channel) => {
            // Handled by AntiNukeCog
        });

        this.client.on('channelUpdate', async (oldCh, newCh) => {
            const changes = [];

            if (oldCh.name !== newCh.name) {
                changes.push(`**Name:** ${oldCh.name} → ${newCh.name}`);
            }

            if (oldCh.topic !== newCh.topic) {
                changes.push(`**Topic:** ${oldCh.topic || "None"} → ${newCh.topic || "None"}`);
            }

            if ('rateLimitPerUser' in oldCh && oldCh.rateLimitPerUser !== newCh.rateLimitPerUser) {
                changes.push(`**Slowmode:** ${oldCh.rateLimitPerUser}s → ${newCh.rateLimitPerUser}s`);
            }

            if (changes.length === 0) return;

            const embed = new EmbedBuilder()
                .setTitle("✏️ Channel Updated")
                .setColor(Config.WARNING_COLOR || 0xffff00)
                .setTimestamp();

            embed.addFields(
                { name: "Channel", value: newCh.toString(), inline: true },
                { name: "Changes", value: changes.join('\n'), inline: false }
            );

            try {
                const audit = await newCh.guild.fetchAuditLogs({ limit: 1, type: 11 });
                const entry = audit.entries.first();
                if (entry && entry.target.id === newCh.id) {
                    embed.addFields({ name: "Updated By", value: entry.executor.toString(), inline: true });
                }
            } catch (e) {}

            embed.setFooter({ text: `Channel ID: ${newCh.id}` });

            await this.sendLog(newCh.guild, embed);
        });

        this.client.on('roleCreate', async (role) => {
            const embed = new EmbedBuilder()
                .setTitle("➕ Role Created")
                .setColor(role.color || Config.SUCCESS_COLOR || 0x00ff00)
                .setTimestamp();

            embed.addFields(
                { name: "Role", value: `<@&${role.id}>`, inline: true },
                { name: "Color", value: role.hexColor, inline: true },
                { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
                { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true }
            );

            try {
                const audit = await role.guild.fetchAuditLogs({ limit: 1, type: 30 });
                const entry = audit.entries.first();
                if (entry && entry.target.id === role.id) {
                    embed.addFields({ name: "Created By", value: entry.executor.toString(), inline: true });
                }
            } catch (e) {}

            embed.setFooter({ text: `Role ID: ${role.id}` });

            await this.sendLog(role.guild, embed);
        });

        this.client.on('roleDelete', async (role) => {
            // Handled by AntiNukeCog
        });

        this.client.on('roleUpdate', async (oldRole, newRole) => {
            const changes = [];

            if (oldRole.name !== newRole.name) {
                changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
            }

            if (oldRole.color !== newRole.color) {
                changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
            }

            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
                changes.push(`**Permissions:** Updated`);
            }

            if (oldRole.mentionable !== newRole.mentionable) {
                changes.push(`**Mentionable:** ${oldRole.mentionable ? "Yes" : "No"} → ${newRole.mentionable ? "Yes" : "No"}`);
            }

            if (oldRole.hoist !== newRole.hoist) {
                changes.push(`**Hoisted:** ${oldRole.hoist ? "Yes" : "No"} → ${newRole.hoist ? "Yes" : "No"}`);
            }

            if (changes.length === 0) return;

            const embed = new EmbedBuilder()
                .setTitle("✏️ Role Updated")
                .setColor(newRole.color || Config.WARNING_COLOR || 0xffff00)
                .setTimestamp();

            embed.addFields(
                { name: "Role", value: `<@&${newRole.id}>`, inline: true },
                { name: "Changes", value: changes.join('\n'), inline: false }
            );

            try {
                const audit = await newRole.guild.fetchAuditLogs({ limit: 1, type: 31 });
                const entry = audit.entries.first();
                if (entry && entry.target.id === newRole.id) {
                    embed.addFields({ name: "Updated By", value: entry.executor.toString(), inline: true });
                }
            } catch (e) {}

            embed.setFooter({ text: `Role ID: ${newRole.id}` });

            await this.sendLog(newRole.guild, embed);
        });

        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            if (!oldState.channel && newState.channel) {
                const embed = new EmbedBuilder()
                    .setTitle("🔊 Joined Voice Channel")
                    .setColor(Config.SUCCESS_COLOR || 0x00ff00)
                    .setTimestamp();

                embed.addFields(
                    { name: "User", value: newState.member.toString(), inline: true },
                    { name: "Channel", value: newState.channel.name, inline: true }
                );
                embed.setFooter({ text: `User ID: ${newState.member.id}` });

                await this.sendLog(newState.member.guild, embed);
            } else if (oldState.channel && !newState.channel) {
                const embed = new EmbedBuilder()
                    .setTitle("🔇 Left Voice Channel")
                    .setColor(Config.ERROR_COLOR || 0xff0000)
                    .setTimestamp();

                embed.addFields(
                    { name: "User", value: newState.member.toString(), inline: true },
                    { name: "Channel", value: oldState.channel.name, inline: true }
                );
                embed.setFooter({ text: `User ID: ${newState.member.id}` });

                await this.sendLog(newState.member.guild, embed);
            } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                const embed = new EmbedBuilder()
                    .setTitle("🔄 Moved Voice Channels")
                    .setColor(Config.INFO_COLOR || 0x00ccff)
                    .setTimestamp();

                embed.addFields(
                    { name: "User", value: newState.member.toString(), inline: true },
                    { name: "From", value: oldState.channel.name, inline: true },
                    { name: "To", value: newState.channel.name, inline: true }
                );
                embed.setFooter({ text: `User ID: ${newState.member.id}` });

                await this.sendLog(newState.member.guild, embed);
            }
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            if (interaction.commandName === 'logs') {
                const subcommand = interaction.options.getString('action');

                if (!subcommand) {
                    const logChannel = await this.getLogChannel(interaction.guild);
                    const embed = new EmbedBuilder()
                        .setTitle("📋 Logging System Status")
                        .setColor(logChannel ? Config.SUCCESS_COLOR : Config.ERROR_COLOR);

                    if (logChannel) {
                        embed.addFields(
                            { name: "Log Channel", value: logChannel.toString(), inline: true },
                            { name: "Status", value: "🟢 Active", inline: true }
                        );
                    } else {
                        embed.addFields({ name: "Status", value: "🔴 No log channel", inline: true });
                    }

                    embed.addFields(
                        { name: "📊 Logged Events", value: "• Message edits/deletions\n• Role changes\n• Channel updates\n• Voice activity" },
                        { name: "Commands", value: "`/logs setup`\n`/logs test`" }
                    );

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else if (subcommand === 'test') {
                    const embed = new EmbedBuilder()
                        .setTitle("🧪 Test Log Message")
                        .setDescription("This is a test message to verify logging is working.")
                        .setColor(Config.INFO_COLOR || 0x00ccff)
                        .setTimestamp()
                        .addFields({ name: "Triggered By", value: interaction.user.toString(), inline: true })
                        .setFooter({ text: "Logging system test" });

                    await this.sendLog(interaction.guild, embed);
                    await interaction.reply({ content: "✅ Test log message sent!", ephemeral: true });
                }
            }
        });
    }
};
