const { EmbedBuilder } = require('discord.js');
const Config = require('../config');

module.exports = class AntiSpamCog {
    constructor(client, database) {
        this.client = client;
        this.db = database;

        this.userMessages = new Map();
        this.warnedUsers = new Set();

        this.setupListeners();
    }

    async getLogChannel(guild) {
        const logChannelName = Config.LOG_CHANNEL_NAME || 'mod-logs';
        return guild.channels.cache.find(ch => ch.name === logChannelName);
    }

    async logSpamAction(guild, user, action, messageCount) {
        const logChannel = await this.getLogChannel(guild);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle("🚫 Anti-Spam Action")
            .setColor(Config.ERROR_COLOR || 0xff0000)
            .setTimestamp();

        embed.addFields(
            { name: "User", value: `${user.toString()} (${user.id})`, inline: true },
            { name: "Action", value: action, inline: true },
            { name: "Message Count", value: `${messageCount} in 1 minute`, inline: true },
            { name: "Reason", value: "Exceeded spam limit (30 messages/minute)", inline: false }
        );

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (e) {}
    }

    isSpam(userId) {
        const now = new Date();
        let messages = this.userMessages.get(userId);

        if (!messages) {
            messages = [];
            this.userMessages.set(userId, messages);
        }

        // Remove messages older than 60 seconds
        while (messages.length && now - messages[0] > 60000) {
            messages.shift();
        }

        messages.push(now);

        return messages.length > Config.SPAM_MESSAGE_LIMIT + 5; // Nerf: Higher threshold
    }

    setupListeners() {
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.guild) return;

            if (message.member?.permissions.has('ManageMessages')) return;

            const userId = message.author.id;

            if (this.isSpam(userId)) {
                try {
                    if (!this.warnedUsers.has(userId)) {
                        this.warnedUsers.add(userId);

                        try {
                            const warningEmbed = new EmbedBuilder()
                                .setTitle("⚠️ Spam Warning")
                                .setDescription("You are sending messages too quickly! Please slow down or you will be kicked.")
                                .setColor(Config.WARNING_COLOR || 0xffff00);

                            await message.author.send({ embeds: [warningEmbed] });
                        } catch (e) {}

                        const warnMsg = await message.channel.send({
                            content: `⚠️ ${message.author}, you're sending messages too quickly! Slow down or you'll be kicked.`
                        });

                        setTimeout(async () => {
                            try {
                                await warnMsg.delete();
                            } catch (e) {}
                        }, 10000);

                        await this.logSpamAction(message.guild, message.author, "WARNING", this.userMessages.get(userId)?.length || 0);

                        setTimeout(async () => {
                            if (this.isSpam(userId)) {
                                try {
                                    await message.author.kick("Spam: Exceeded 30 msg/min after warning");
                                    await this.logSpamAction(message.guild, message.author, "KICKED", this.userMessages.get(userId)?.length || 0);
                                } catch (e) {
                                    try {
                                        await message.author.timeout(600000, "Spam: exceeded limit");
                                        await this.logSpamAction(message.guild, message.author, "TIMED OUT", this.userMessages.get(userId)?.length || 0);
                                    } catch (e2) {
                                        await this.logSpamAction(message.guild, message.author, "DETECTED", this.userMessages.get(userId)?.length || 0);
                                    }
                                }

                                this.userMessages.delete(userId);
                                this.warnedUsers.delete(userId);
                            } else {
                                this.warnedUsers.delete(userId);
                            }
                        }, 30000); // Nerf: longer grace period

                    } else {
                        try {
                            await message.author.kick("Spam: Continued spamming after warning");
                            await this.logSpamAction(message.guild, message.author, "KICKED", this.userMessages.get(userId)?.length || 0);
                        } catch (e) {
                            try {
                                await message.author.timeout(600000, "Spam: continued spamming");
                                await this.logSpamAction(message.guild, message.author, "TIMED OUT", this.userMessages.get(userId)?.length || 0);
                            } catch (e2) {
                                await this.logSpamAction(message.guild, message.author, "DETECTED", this.userMessages.get(userId)?.length || 0);
                            }
                        }

                        this.userMessages.delete(userId);
                        this.warnedUsers.delete(userId);
                    }
                } catch (e) {}
            }
        });

        this.client.on('guildMemberRemove', (member) => {
            const userId = member.id;
            this.userMessages.delete(userId);
            this.warnedUsers.delete(userId);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const cmd = interaction.commandName;

            if (cmd === 'antispam') {
                const embed = new EmbedBuilder()
                    .setTitle("🚫 Anti-Spam System")
                    .setDescription("Information about anti-spam protection")
                    .addFields([
                        {
                            name: "📊 Current Settings",
                            value: `**Message Limit:** ${Config.SPAM_MESSAGE_LIMIT + 5}\n` +
                                   `**Action:** Warning → Kick\n` +
                                   `**Exempt:** Manage Messages permission`
                        },
                        {
                            name: "📈 Current Status",
                            value: `**Active Users Tracked:** ${this.userMessages.size}\n` +
                                   `**Users with Warnings:** ${this.warnedUsers.size}`
                        },
                        {
                            name: "⚙️ How It Works",
                            value: `• Tracks messages per user\n` +
                                   `• First violation: Warning + 30s grace period\n` +
                                   `• Continued spam: Kick from server`
                        }
                    ])
                    .setFooter({ text: "Anti-spam is always active" })
                    .setColor(Config.INFO_COLOR || 0x00ccff);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (cmd === 'clearspam') {
                const target = interaction.options.getUser('user');
                if (target) {
                    this.userMessages.delete(target.id);
                    this.warnedUsers.delete(target.id);

                    const embed = new EmbedBuilder()
                        .setTitle("✅ Spam Tracking Cleared")
                        .setDescription(`Cleared spam tracking for ${target.username}`)
                        .addFields({ name: "Moderator", value: interaction.user.toString() })
                        .setColor(Config.SUCCESS_COLOR || 0x00ff00);

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    this.userMessages.clear();
                    this.warnedUsers.clear();

                    const embed = new EmbedBuilder()
                        .setTitle("✅ All Spam Tracking Cleared")
                        .setDescription("All spam tracking has been reset.")
                        .addFields({ name: "Moderator", value: interaction.user.toString() })
                        .setColor(Config.SUCCESS_COLOR || 0x00ff00);

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }
        });
    }
};
