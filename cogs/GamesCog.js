const { EmbedBuilder } = require('discord.js');
const Config = require('../config');
const db = require('../database');

module.exports = class GamesCog {
    constructor(client, database) {
        this.client = client;
        this.db = database || db;

        this.activeGames = new Set(); // Track active games to prevent spam

        this.games = {
            coinflip: { cooldown: 10 },
            dice: { cooldown: 10 },
            rps: { cooldown: 10 },
            trivia: { cooldown: 15 },
            number: { cooldown: 20 },
            slots: { cooldown: 15 },
            memory: { cooldown: 20 },
            riddle: { cooldown: 20 },
            math: { cooldown: 15 },
            scramble: { cooldown: 15 },
            reaction: { cooldown: 30 }
        };

        this.setupCommands();
    }

    isInGame(userId) {
        return this.activeGames.has(userId);
    }

    addCooldown(userId, gameName) {
        this.activeGames.add(userId);

        setTimeout(() => {
            this.activeGames.delete(userId);
        }, (this.games[gameName]?.cooldown || 15) * 1000);
    }

    async getGameStats(user, guild) {
        try {
            const stats = await this.db.getGameStats(user.id, guild.id);
            if (!stats || !Array.isArray(stats)) return null;

            const result = {
                totalWins: 0,
                totalLosses: 0,
                totalPoints: 0,
                games: {}
            };

            stats.forEach(stat => {
                const [userId, guildId, game, wins, losses, points] = stat;
                result.totalWins += wins;
                result.totalLosses += losses;
                result.totalPoints += points;
                result.games[game] = { wins, losses, points };
            });

            return result;
        } catch (e) {
            return null;
        }
    }

    setupCommands() {
        const self = this;

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            const cmd = interaction.commandName;

            if (cmd === 'gamestats') {
                const user = interaction.options.getUser('user') || interaction.user;

                const stats = await this.getGameStats(user, interaction.guild);
                if (!stats) {
                    const embed = new EmbedBuilder()
                        .setTitle("🎮 Game Statistics")
                        .setDescription(`${user.username} hasn't played any games yet!`)
                        .setColor(Config.INFO_COLOR || 0x00ccff);

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 Game Statistics - ${user.username}`)
                    .setColor(Config.INFO_COLOR || 0x00ccff)
                    .addFields(
                        { name: "📊 Overall Stats", value: `**Wins:** ${stats.totalWins}\n**Losses:** ${stats.totalLosses}\n**Points:** ${stats.totalPoints}`, inline: false }
                    );

                Object.entries(stats.games).forEach(([game, data]) => {
                    embed.addFields({
                        name: `🎯 ${game}`,
                        value: `W: ${data.wins} | L: ${data.losses} | P: ${data.points}`,
                        inline: true
                    });
                });

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (cmd === 'coinflip' || cmd === 'cf') {
                if (self.isInGame(interaction.user.id)) {
                    await interaction.reply("⏰ You're on game cooldown!");
                    return;
                }

                const choice = interaction.options.getString('choice')?.toLowerCase();

                if (!['heads', 'h', 'tails', 't'].includes(choice)) {
                    await interaction.reply("❌ Please choose heads or tails.");
                    return;
                }

                const normalizedChoice = ['h', 'heads'].includes(choice) ? 'heads' : 'tails';
                const result = Math.random() > 0.5 ? 'heads' : 'tails';

                const won = normalizedChoice === result;
                const points = won ? 10 : 0;

                const embed = new EmbedBuilder()
                    .setTitle("🪙 Coin Flip")
                    .setColor(won ? Config.SUCCESS_COLOR : Config.ERROR_COLOR)
                    .addFields([
                        { name: "Your Choice", value: normalizedChoice, inline: true },
                        { name: "Result", value: result, inline: true },
                        { name: "Points", value: `+${points}`, inline: true }
                    ]);

                if (won) {
                    embed.setDescription("🎉 You won!");
                } else {
                    embed.setDescription("💸 You lost!");
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
                await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "coinflip", won, points);
                this.addCooldown(interaction.user.id, 'coinflip');
            }

            if (cmd === 'dice' || cmd === 'roll') {
                if (self.isInGame(interaction.user.id)) {
                    await interaction.reply("⏰ You're on game cooldown!");
                    return;
                }

                let guess = interaction.options.getInteger('guess');
                if (!guess || guess < 1 || guess > 6) {
                    await interaction.reply("❌ Please guess a number between 1 and 6.");
                    return;
                }

                const result = Math.floor(Math.random() * 6) + 1;
                const won = guess === result;
                const points = won ? 50 : 0;

                const embed = new EmbedBuilder()
                    .setTitle("🎲 Dice Roll")
                    .setColor(won ? Config.SUCCESS_COLOR : Config.ERROR_COLOR)
                    .addFields([
                        { name: "Your Guess", value: guess.toString(), inline: true },
                        { name: "Result", value: result.toString(), inline: true },
                        { name: "Points", value: `+${points}`, inline: true }
                    ]);

                if (won) {
                    embed.setDescription("🎉 Perfect guess!");
                } else {
                    embed.setDescription("💸 Better luck next time!");
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
                await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "dice", won, points);
                this.addCooldown(interaction.user.id, 'dice');
            }

            if (cmd === 'rps') {
                if (self.isInGame(interaction.user.id)) {
                    await interaction.reply("⏰ You're on game cooldown!");
                    return;
                }

                const choice = interaction.options.getString('choice')?.toLowerCase();
                const validChoices = ['rock', 'paper', 'scissors', 'r', 'p', 's'];
                if (!validChoices.includes(choice)) {
                    await interaction.reply("❌ Invalid choice! Use rock, paper, or scissors");
                    return;
                }

                const choiceMap = { r: 'rock', p: 'paper', s: 'scissors' };
                const playerChoice = choiceMap[choice] || choice;
                const botChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];

                let result, earnedPoints;
                if (playerChoice === botChoice) {
                    result = "tie";
                    earnedPoints = 5;
                } else if (
                    (playerChoice === 'rock' && botChoice === 'scissors') ||
                    (playerChoice === 'paper' && botChoice === 'rock') ||
                    (playerChoice === 'scissors' && botChoice === 'paper')
                ) {
                    result = "win";
                    earnedPoints = 25;
                } else {
                    result = "loss";
                    earnedPoints = 0;
                }

                const embed = new EmbedBuilder()
                    .setTitle("✂️ Rock Paper Scissors")
                    .setColor(result === "win" ? Config.SUCCESS_COLOR : result === "tie" ? Config.WARNING_COLOR : Config.ERROR_COLOR)
                    .addFields([
                        { name: "Your Choice", value: playerChoice, inline: true },
                        { name: "Bot Choice", value: botChoice, inline: true },
                        { name: "Points", value: `+${earnedPoints}`, inline: true }
                    ]);

                if (result === "win") {
                    embed.setDescription("🎉 You won!");
                } else if (result === "tie") {
                    embed.setDescription("🤝 It's a tie!");
                } else {
                    embed.setDescription("💸 You lost!");
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
                await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "rps", result === "win", earnedPoints);
                this.addCooldown(interaction.user.id, 'rps');
            }

            if (cmd === 'trivia') {
                if (self.isInGame(interaction.user.id)) {
                    await interaction.reply("⏰ You're on game cooldown!");
                    return;
                }

                const questions = [
                    { q: "What is the capital of France?", a: "paris" },
                    { q: "Which planet is known as the Red Planet?", a: "mars" },
                    { q: "What is 2 + 2?", a: "4" },
                    { q: "Who painted the Mona Lisa?", a: "leonardo da vinci" },
                    { q: "What is the largest ocean on Earth?", a: "pacific" },
                    { q: "In which year did World War II end?", a: "1945" },
                    { q: "What is the chemical symbol for gold?", a: "au" },
                    { q: "Which country gifted the Statue of Liberty to the USA?", a: "france" }
                ];

                const questionData = questions[Math.floor(Math.random() * questions.length)];
                const answer = questionData.a.toLowerCase();

                const embed = new EmbedBuilder()
                    .setTitle("🧠 Trivia Question")
                    .setDescription(questionData.q)
                    .setColor(Config.INFO_COLOR)
                    .setFooter({ text: "You have 30 seconds to answer!" });

                await interaction.reply({ embeds: [embed], ephemeral: true });

                try {
                    const reply = await this.client.awaitMessageResponse(interaction, 30000, interaction.user);
                    const userAnswer = reply.content.trim().toLowerCase();

                    const correct = userAnswer === answer;

                    const resultEmbed = new EmbedBuilder()
                        .setTitle("🧠 Trivia Result")
                        .setColor(correct ? Config.SUCCESS_COLOR : Config.ERROR_COLOR)
                        .addFields({ name: "Points", value: `+${correct ? 30 : 0}` });

                    if (correct) {
                        resultEmbed.setDescription("🎉 Correct answer!");
                    } else {
                        resultEmbed.setDescription(`❌ Wrong! The correct answer was: ${answer}`);
                    }

                    await interaction.followUp({ embeds: [resultEmbed], ephemeral: true });
                    await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "trivia", correct, correct ? 30 : 0);
                } catch (e) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle("⏰ Time's Up!")
                        .setDescription(`The correct answer was: ${answer}`)
                        .setColor(Config.ERROR_COLOR);

                    await interaction.followUp({ embeds: [timeoutEmbed], ephemeral: true });
                    await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "trivia", false, 0);
                }

                this.addCooldown(interaction.user.id, 'trivia');
            }

            if (cmd === 'number') {
                if (self.isInGame(interaction.user.id)) {
                    await interaction.reply("⏰ You're on game cooldown!");
                    return;
                }

                const difficulty = interaction.options.getString('difficulty') || 'easy';
                const difficulties = {
                    easy: { range: 10, attempts: 3, points: 20 },
                    medium: { range: 50, attempts: 5, points: 40 },
                    hard: { range: 100, attempts: 7, points: 60 }
                };

                if (!difficulties[difficulty]) {
                    await interaction.reply("❌ Invalid difficulty! Choose: easy, medium, or hard");
                    return;
                }

                const config = difficulties[difficulty];
                const secretNumber = Math.floor(Math.random() * config.range) + 1;
                let attemptsLeft = config.attempts;

                const embed = new EmbedBuilder()
                    .setTitle("🔢 Number Guessing Game")
                    .setDescription(`I'm thinking of a number between 1 and ${config.range}!\nYou have ${attemptsLeft} attempts.`)
                    .setColor(Config.INFO_COLOR)
                    .addFields([
                        { name: "Difficulty", value: difficulty, inline: true },
                        { name: "Potential Points", value: `${config.points}`, inline: true }
                    ]);

                await interaction.reply({ embeds: [embed], ephemeral: true });

                let won = false;
                while (attemptsLeft > 0 && !won) {
                    try {
                        const reply = await this.client.awaitMessageResponse(interaction, 60000, interaction.user);
                        const guess = parseInt(reply.content);
                        attemptsLeft--;

                        if (guess === secretNumber) {
                            won = true;
                            break;
                        }
                    } catch (e) {
                        await interaction.followUp("⏰ Time's up! Game ended.");
                        break;
                    }
                }

                const earned = won ? config.points : 0;
                const resultEmbed = new EmbedBuilder()
                    .setTitle("🔢 Game Result")
                    .setColor(won ? Config.SUCCESS_COLOR : Config.ERROR_COLOR)
                    .addFields({ name: "Points", value: `+${earned}` });

                if (won) {
                    resultEmbed.setDescription(`🎉 Correct! The number was ${secretNumber}!`);
                } else {
                    resultEmbed.setDescription(`💸 Game over! The number was ${secretNumber}.`);
                }

                await interaction.followUp({ embeds: [resultEmbed], ephemeral: true });
                await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "number_guess", won, earned);
                this.addCooldown(interaction.user.id, 'number');
            }

            if (cmd === 'slots') {
                if (self.isInGame(interaction.user.id)) {
                    await interaction.reply("⏰ You're on game cooldown!");
                    return;
                }

                const symbols = ['🍎', '🍊', '🍇', '🍒', '🍋', '💎', '⭐', '🔔'];
                const weights = [20, 20, 20, 20, 10, 5, 3, 2];

                function weightedRandom(items, weights) {
                    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                    let random = Math.random() * totalWeight;
                    return items.find((_, i) => (random -= weights[i]) <= 0);
                }

                const result = Array.from({ length: 3 }, () => weightedRandom(symbols, weights));
                let points = 0;

                if (result[0] === result[1] && result[1] === result[2]) {
                    points = result[0] === '💎' ? 200 :
                             result[0] === '⭐' ? 150 :
                             result[0] === '🔔' ? 100 : 50;
                } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
                    points = 10;
                }

                const embed = new EmbedBuilder()
                    .setTitle("🎰 Slot Machine")
                    .setDescription(result.join(' '))
                    .setColor(points > 0 ? Config.SUCCESS_COLOR : Config.ERROR_COLOR);

                if (points > 0) {
                    embed.addFields({ name: "Result", value: "🎉 Winner!", inline: false });
                    if (points >= 100) {
                        embed.addFields({ name: "Special", value: "💰 JACKPOT!", inline: true });
                    }
                } else {
                    embed.addFields({ name: "Result", value: "💸 Try again!", inline: false });
                }

                embed.addFields({ name: "Points", value: `+${points}` });

                await interaction.reply({ embeds: [embed], ephemeral: true });
                await this.db.updateGameStats(interaction.user.id, interaction.guild.id, "slots", points > 0, points);
                this.addCooldown(interaction.user.id, 'slots');
            }

            if (cmd === 'games') {
                const embed = new EmbedBuilder()
                    .setTitle("🎮 Available Games")
                    .setDescription("Here are all the games you can play:")
                    .setColor(Config.INFO_COLOR)
                    .addFields([
                        { name: "🪙 `!coinflip heads/tails`", value: "Guess heads or tails (10 pts)", inline: false },
                        { name: "🎲 `!dice 1-6`", value: "Guess the dice roll (50 pts)", inline: false },
                        { name: "✂️ `!rps rock/paper/scissors`", value: "Rock Paper Scissors (25 pts)", inline: false },
                        { name: "🧠 `!trivia`", value: "Answer trivia questions (30 pts)", inline: false },
                        { name: "🔢 `!number easy/medium/hard`", value: "Number guessing game (20-60 pts)", inline: false },
                        { name: "🎰 `!slots`", value: "Slot machine game (up to 200 pts)", inline: false },
                        { name: "🧠 `!memory easy/medium/hard`", value: "Memory sequence game (15-50 pts)", inline: false },
                        { name: "🤔 `!riddle`", value: "Solve riddles (35 pts)", inline: false },
                        { name: "🔢 `!math easy/medium/hard`", value: "Solve math problems (20-50 pts)", inline: false },
                        { name: "🔤 `!wordscramble`", value: "Unscramble words (25 pts)", inline: false },
                        { name: "⚡ `!reaction`", value: "Test your reaction time (10-100 pts)", inline: false },
                        { name: "📊 `!gamestats`", value: "Check your game statistics", inline: false }
                    ])
                    .addFields({
                        name: "💡 Tips",
                        value: "• Games have cooldowns\n• Points are tracked in stats\n• Some games have difficulty levels"
                    });

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Add more commands here (memory, riddle, math, etc.)
            // For brevity, only core ones shown above

        });
    }
};
