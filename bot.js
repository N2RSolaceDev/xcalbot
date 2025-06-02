require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, MessageMentionTypes } = require('discord.js');
const express = require('express'); // For hosting on a port
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
    ]
});

const db = require('./database');

// Load Cogs
const ModerationCog = require('./cogs/ModerationCog');
const GamesCog = require('./cogs/GamesCog');
const AntiSpamCog = require('./cogs/AntiSpamCog');
const AntiRaidCog = require('./cogs/AntiRaidCog');
const AntiNukeCog = require('./cogs/AntiNukeCog');
const LoggingCog = require('./cogs/LoggingCog');

// Express setup for keeping the bot alive or handling webhooks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Discord Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

client.once('ready', async () => {
    console.log(`${client.user.tag} has logged in!`);
    console.log(`Bot ID: ${client.user.id}`);
    
    console.log('Initializing database...');
    await db.initialize();
    console.log('Database initialized!');

    // Set presence
    client.user.setActivity("Moderating the server | !help", { type: ActivityType.Playing });
});

// Mention handler
client.on('messageCreate', async (message) => {
    if (!message.content) return;
    if (message.author.bot) return;

    // Check if the bot was mentioned
    if (message.mentions.users.has(client.user.id)) {
        message.reply({
            content: '🔧 **Powered By Solace + Solbot** — discord.gg/solbot - in partnership with xcal',
            allowedMentions: { repliedUser: false }
        });
    }
});

client.on('guildCreate', async (guild) => {
    let logChannel = guild.channels.cache.find(ch => ch.name === 'mod-logs');
    if (!logChannel) {
        try {
            logChannel = await guild.channels.create({ 
                name: 'mod-logs',
                type: 0, // Text channel
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: ['ViewChannel'],
                    },
                    {
                        id: client.user.id,
                        allow: ['ViewChannel', 'SendMessages'],
                    }
                ]
            });
            await logChannel.send("🔧 **Moderation Log Channel Created**\nThis channel will log all moderation activities.");
        } catch (error) {
            console.error(`Could not create log channel in ${guild.name}:`, error.message);
        }
    }
});

// Initialize Cogs
new ModerationCog(client, db);
new GamesCog(client, db);
new AntiSpamCog(client, db);
new AntiRaidCog(client, db);
new AntiNukeCog(client, db);
new LoggingCog(client, db);

// Login
client.login(process.env.DISCORD_TOKEN);
