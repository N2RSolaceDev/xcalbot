const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildRoles
    ]
});

const ROLE_ID = '1379130868479692852'; // Role ID of "solbot"

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.get('YOUR_GUILD_ID'); // Replace with your Guild ID
    if (!guild) {
        console.error("Guild not found.");
        return;
    }

    const role = guild.roles.cache.get(ROLE_ID);
    if (!role) {
        console.error("Role not found.");
        return;
    }

    const member = await guild.members.fetch(client.user.id);
    if (!member.permissions.has('ManageRoles')) {
        console.error("Bot doesn't have ManageRoles permission.");
        return;
    }

    // Get all roles below the bot's top role
    const movableRoles = guild.roles.cache
        .filter(r => r.position < member.top_role.position && r.position !== role.position)
        .sort((a, b) => b.position - a.position); // Descending order

    const newPosition = movableRoles.first().position;

    if (role.position === newPosition) {
        console.log("Role is already at the highest possible position.");
        return;
    }

    try {
        await role.setPosition(newPosition);
        console.log(`Moved role "${role.name}" to position ${newPosition}`);
    } catch (error) {
        console.error("Failed to move role:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);