const { EmbedBuilder } = require('discord.js');
const Config = require('../config'); // Your config file with colors, log channel name, etc.
const db = require('../database'); // Placeholder for your database module

module.exports = class ModerationCog {
    constructor(client, database) {
        this.client = client;
        this.db = database || db;

        this.setupCommands();
    }

    async getLogChannel(guild) {
        const logChannelName = Config.LOG_CHANNEL_NAME || 'mod-logs';
        const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);
        return logChannel;
    }

    async logAction(guild, action, moderator, target, reason = null, duration = null) {
        const logChannel = await this.getLogChannel(guild);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🔨 ${action}`)
            .setColor(Config.WARNING_COLOR || 0xff9900)
            .setTimestamp();

        embed.addFields(
            { name: "Target", value: `${target.toString()} (${target.id})`, inline: true },
            { name: "Moderator", value: `${moderator.toString()} (${moderator.id})`, inline: true }
        );

        if (reason) embed.addFields({ name: "Reason", value: reason, inline: false });
        if (duration) embed.addFields({ name: "Duration", value: duration, inline: true });

        embed.setFooter({ text: `User ID: ${target.id}` });

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (e) {
            // Ignore logging errors
        }
    }

    setupCommands() {
        const moderation = this;

        this.client.on('messageCreate', async (message) => {
            if (!message.content.startsWith(Config.PREFIX || '!') || message.author.bot) return;

            const args = message.content.slice(1).split(/\s+/);
            const command = args.shift().toLowerCase();

            if (command === 'kick') {
                moderation.kickUser(message, args);
            } else if (command === 'ban') {
                moderation.banUser(message, args);
            } else if (command === 'unban') {
                moderation.unbanUser(message, args);
            } else if (command === 'timeout') {
                moderation.timeoutUser(message, args);
            } else if (command === 'untimeout') {
                moderation.untimeoutUser(message, args);
            } else if (command === 'warn') {
                moderation.warnUser(message, args);
            } else if (command === 'warnings') {
                moderation.checkWarnings(message, args);
            } else if (command === 'clearwarnings') {
                moderation.clearWarnings(message, args);
            } else if (command === 'purge') {
                moderation.purgeMessages(message, args);
            }
        });
    }

    async kickUser(message, args) {
        const usage = `Usage: \`${Config.PREFIX || '!'}kick @user [reason]\``;

        if (!message.member.permissions.has('KickMembers')) {
            return message.reply("❌ You don't have permission to kick members!");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Please mention a user to kick!");

        const member = message.guild.members.cache.get(user.id);
        if (!member) return message.reply("❌ User not found!");

        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply("❌ You cannot kick someone with a higher or equal role!");
        }

        const reason = args.slice(1).join(' ') || "No reason provided";

        try {
            await member.kick(reason);

            const embed = new EmbedBuilder()
                .setTitle("✅ User Kicked")
                .setDescription(`${user} has been kicked from the server.`)
                .addFields(
                    { name: "Reason", value: reason },
                    { name: "Moderator", value: message.author.toString() }
                )
                .setColor(Config.SUCCESS_COLOR || 0x00ff00);

            await message.channel.send({ embeds: [embed] });
            await this.logAction(message.guild, "KICK", message.author, user, reason);
        } catch (e) {
            return message.reply("❌ I don't have permission to kick this user!");
        }
    }

    async banUser(message, args) {
        const usage = `Usage: \`${Config.PREFIX || '!'}ban @user [reason]\``;

        if (!message.member.permissions.has('BanMembers')) {
            return message.reply("❌ You don't have permission to ban members!");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Please mention a user to ban!");

        const member = message.guild.members.cache.get(user.id);
        if (!member) return message.reply("❌ User not found!");

        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply("❌ You cannot ban someone with a higher or equal role!");
        }

        const reason = args.slice(1).join(' ') || "No reason provided";

        try {
            await member.ban({ reason });

            const embed = new EmbedBuilder()
                .setTitle("🔨 User Banned")
                .setDescription(`${user} has been banned from the server.`)
                .addFields(
                    { name: "Reason", value: reason },
                    { name: "Moderator", value: message.author.toString() }
                )
                .setColor(Config.ERROR_COLOR || 0xff0000);

            await message.channel.send({ embeds: [embed] });
            await this.logAction(message.guild, "BAN", message.author, user, reason);
        } catch (e) {
            return message.reply("❌ I don't have permission to ban this user!");
        }
    }

    async unbanUser(message, args) {
        if (!message.member.permissions.has('BanMembers')) {
            return message.reply("❌ You don't have permission to unban users!");
        }

        const userId = args[0];
        if (!userId || isNaN(userId)) {
            return message.reply("❌ Please provide a valid user ID to unban!");
        }

        const reason = args.slice(1).join(' ') || "No reason provided";

        try {
            const user = await this.client.users.fetch(userId);
            await message.guild.members.unban(user, { reason });

            const embed = new EmbedBuilder()
                .setTitle("✅ User Unbanned")
                .setDescription(`${user} has been unbanned.`)
                .addFields(
                    { name: "Reason", value: reason },
                    { name: "Moderator", value: message.author.toString() }
                )
                .setColor(Config.SUCCESS_COLOR || 0x00ff00);

            await message.channel.send({ embeds: [embed] });
            await this.logAction(message.guild, "UNBAN", message.author, user, reason);
        } catch (e) {
            return message.reply("❌ Could not find banned user or missing permissions.");
        }
    }

    async timeoutUser(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply("❌ You don't have permission to timeout members!");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Please mention a user to timeout.");

        const member = message.guild.members.cache.get(user.id);
        if (!member) return message.reply("❌ User not found.");

        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply("❌ You cannot timeout someone with a higher or equal role!");
        }

        const durationStr = args[1];
        const unit = args[2]?.toLowerCase();
        const reason = args.slice(3).join(' ') || "No reason provided";

        let duration = parseInt(durationStr);
        if (isNaN(duration)) return message.reply("❌ Invalid duration!");

        let delta = 0;
        if (unit.startsWith('m')) {
            delta = duration * 60 * 1000; // minutes
        } else if (unit.startsWith('h')) {
            delta = duration * 60 * 60 * 1000; // hours
        } else if (unit.startsWith('d')) {
            delta = duration * 24 * 60 * 60 * 1000; // days
        } else {
            return message.reply("❌ Use m/h/d for time units.");
        }

        if (delta > 28 * 24 * 60 * 60 * 1000) {
            return message.reply("❌ Timeout cannot exceed 28 days.");
        }

        const until = new Date(Date.now() + delta);
        const durationStrFormatted = `${duration} ${unit}`;

        try {
            await member.timeout(until, reason);

            const embed = new EmbedBuilder()
                .setTitle("⏰ User Timed Out")
                .setDescription(`${user} has been timed out.`)
                .addFields(
                    { name: "Duration", value: durationStrFormatted },
                    { name: "Reason", value: reason },
                    { name: "Moderator", value: message.author.toString() }
                )
                .setColor(Config.WARNING_COLOR || 0xffff00);

            await message.channel.send({ embeds: [embed] });
            await this.logAction(message.guild, "TIMEOUT", message.author, user, reason, durationStrFormatted);
        } catch (e) {
            return message.reply("❌ I don't have permission to timeout this user!");
        }
    }

    async untimeoutUser(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply("❌ You don't have permission to remove timeouts!");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Please mention a user.");

        const member = message.guild.members.cache.get(user.id);
        if (!member) return message.reply("❌ User not found.");

        const reason = args.slice(1).join(' ') || "No reason provided";

        try {
            await member.timeout(null, reason);

            const embed = new EmbedBuilder()
                .setTitle("✅ Timeout Removed")
                .setDescription(`Timeout removed from ${user}.`)
                .addFields(
                    { name: "Reason", value: reason },
                    { name: "Moderator", value: message.author.toString() }
                )
                .setColor(Config.SUCCESS_COLOR || 0x00ff00);

            await message.channel.send({ embeds: [embed] });
            await this.logAction(message.guild, "UNTIMEOUT", message.author, user, reason);
        } catch (e) {
            return message.reply("❌ I don't have permission to remove timeout from this user!");
        }
    }

    async warnUser(message, args) {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply("❌ You don't have permission to warn users!");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Please mention a user to warn.");

        const reason = args.slice(1).join(' ') || "No reason provided";
        const warningCount = await db.addWarning(user.id, message.guild.id, message.author.id, reason);

        const embed = new EmbedBuilder()
            .setTitle("⚠️ User Warned")
            .setDescription(`${user} has been warned.`)
            .addFields(
                { name: "Reason", value: reason },
                { name: "Warning Count", value: warningCount.toString() },
                { name: "Moderator", value: message.author.toString() }
            )
            .setColor(Config.WARNING_COLOR || 0xffff00);

        await message.channel.send({ embeds: [embed] });
        await this.logAction(message.guild, "WARN", message.author, user, reason);

        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle("⚠️ You've Been Warned")
                .setDescription(`You were warned in **${message.guild.name}**`)
                .addFields(
                    { name: "Reason", value: reason },
                    { name: "Total Warnings", value: warningCount.toString() }
                )
                .setColor(Config.WARNING_COLOR || 0xffff00);

            await user.send({ embeds: [dmEmbed] });
        } catch (e) {
            // Ignore DM errors
        }
    }

    async checkWarnings(message, args) {
        let user = message.mentions.users.first() || message.author;
        const warnings = await db.getWarnings(user.id, message.guild.id);

        if (!warnings.length) {
            const embed = new EmbedBuilder()
                .setTitle("✅ No Warnings")
                .setDescription(`${user} has no warnings.`)
                .setColor(Config.SUCCESS_COLOR || 0x00ff00);

            return message.channel.send({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Warnings for ${user.username}`)
            .setColor(Config.WARNING_COLOR || 0xffff00);

        const lastTen = warnings.slice(-10);

        lastTen.forEach((warning, i) => {
            const [id, userId, guildId, modId, reason, timestamp] = warning;
            const mod = this.client.users.cache.get(modId) || { username: 'Unknown' };
            embed.addFields({
                name: `Warning #${i + 1}`,
                value: `**Reason:** ${reason}\n**Moderator:** ${mod.username}\n**Date:** ${timestamp}`
            });
        });

        embed.addFields({ name: "Total Warnings", value: warnings.length.toString() });

        await message.channel.send({ embeds: [embed] });
    }

    async clearWarnings(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply("❌ You don't have permission to clear warnings!");
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply("❌ Please mention a user.");

        await db.clearWarnings(user.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle("✅ Warnings Cleared")
            .setDescription(`All warnings cleared for ${user}.`)
            .addFields({ name: "Moderator", value: message.author.toString() })
            .setColor(Config.SUCCESS_COLOR || 0x00ff00);

        await message.channel.send({ embeds: [embed] });
        await this.logAction(message.guild, "CLEAR WARNINGS", message.author, user);
    }

    async purgeMessages(message, args) {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply("❌ You don't have permission to purge messages!");
        }

        let amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) {
            return message.reply("❌ Amount must be between 1 and 100.");
        }

        const user = message.mentions.users.first();

        try {
            const filter = user ? m => m.author.id === user.id : () => true;
            const deleted = await message.channel.bulkDelete(amount + 1, { filter, maxBulk: 100 });

            const count = deleted.size - 1;

            const embed = new EmbedBuilder()
                .setTitle("🗑️ Messages Purged")
                .setDescription(`Deleted ${count} messages.`)
                .addFields(
                    { name: "Moderator", value: message.author.toString() },
                    { name: "Target", value: user?.toString() || "All users" }
                )
                .setColor(Config.SUCCESS_COLOR || 0x00ff00);

            const reply = await message.channel.send({ embeds: [embed] });
            setTimeout(() => reply.delete(), 5000);

            const reason = `Purged ${count} messages from ${user?.username || 'all users'}`;
            await this.logAction(message.guild, "PURGE", message.author, user || message.author, reason);
        } catch (e) {
            return message.reply("❌ An error occurred while deleting messages.");
        }
    }
};
