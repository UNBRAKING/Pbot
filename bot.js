const {
    Telegraf
} = require('telegraf');
const {
    MongoClient
} = require('mongodb');
require('dotenv').config();

const bot = new Telegraf('7176585147:AAETQUAgBIlsxLQprquJkQUUNV0K47nVV3o');
const client = new MongoClient('mongodb+srv://moviessearchbot:moviessearchbot@cluster0.gxqztlk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

const admins = ['5397992078', '5606990991']
let logId = '-1002168567134'; // Log group Id
let dbId = '-1002008957712'; // db group Id
let channelId = '-1001874525841'; // fsub Id
let forwardChannelId = '-1002106510412' // auto send file link in channell id
let botUsername;
let botId;
const dbName = 'Pbot';

bot.telegram.getMe().then((botInfo) => {
    botUsername = botInfo.username;
    botId = botInfo.id;
});
client.connect().then(() => {}).catch(err => {
    bot.telegram.sendMessage(logId, `Error connecting to MongoDB in initializing Bot Setting :\n${err}`);
});

function main() {
    bot.telegram.sendMessage(logId, `Bot Restarted! 🌟`);
    // Error handling middleware
    bot.catch((err, ctx) => {
        console.error(`Encountered an error for ${ctx.updateType}`, err);
        if (err.code === 429 && err.description.includes('FLOOD_WAIT')) {
            const secondsToWait = parseInt(err.parameters.retry_after) || 10; // Default to waiting for 10 seconds
            console.log(`Waiting for ${secondsToWait} seconds before retrying...`);
            setTimeout(() => ctx.updateHandlerChain(), secondsToWait * 1000);
        } else {
            ctx.reply(`Sorry, something went wrong.\nError => ${err}`);
            bot.telegram.sendMessage(logId, `Start Command Error :\n${err}`);
        }
    });
    bot.command('admintoken', async (ctx) => {
        try {
            if (admins.includes(String(ctx.message.from.id)) && ctx.message.chat.type === 'private') {
                const existingEntry = await client.db(dbName).collection('Users').findOne({
                    userId: ctx.message.from.id
                });
                if (existingEntry.isVerified === true) {
                    ctx.react('⚡')
                    ctx.reply('You are already verified.')
                } else {
                    const currentDate = new Date();
                    await client.db(dbName).collection('Users').updateOne({
                        userId: ctx.message.from.id
                    }, {
                        $set: {
                            code: 0,
                            isVerified: true,
                            vDate: currentDate,
                        }
                    });
                    ctx.react('🔥')
                    ctx.reply('Verification Successful!');
                }
            }
        } catch (error) {
            bot.telegram.sendMessage(logId, `Error in Admin Token Verify:\n${error}`);
        }
    });
    bot.command('users', async (ctx) => {
        try {
            if (admins.includes(String(ctx.message.from.id)) && ctx.message.chat.type === 'private') {
                const users = await client.db(dbName).collection('Users').find().toArray();
                const totalUsers = users.length;
                // Count duplicate registrations
                const duplicateUserIds = {};
                users.forEach(async (user) => {
                    duplicateUserIds[user.userId] = (duplicateUserIds[user.userId] || 0) + 1;
                    if (duplicateUserIds[user.userId] > 1) {
                        // Delete the duplicate user
                        await client.db(dbName).collection('Users').deleteOne({
                            userId: user.userId
                        });
                    }
                });
                const duplicateRegistrationsCount = Object.values(duplicateUserIds).filter(count => count > 1).length;

                await ctx.reply(`Total User : ${totalUsers}\nDuplicate Registrations: ${duplicateRegistrationsCount}`);
            }
        } catch (error) {
            bot.telegram.sendMessage(logId, `Error sending total users and blocked users count:\n${error}`);
        }
    });
    bot.command('broadcast', async (ctx) => {
        try {
            if (admins.includes(String(ctx.message.from.id)) && ctx.message.chat.type === 'private') {
                // Check if the command was a reply to a message
                if (ctx.message.reply_to_message) {
                    // Get the message to broadcast
                    const messageToBroadcast = ctx.message.reply_to_message;
                    if (messageToBroadcast) {
                        const users = await client.db(dbName).collection('Users').find().toArray();
                        const totalUsers = users.length;
                        let messagesSent = 0;
                        let blockedBy = 0;
                        const broadcastMessage = await ctx.reply(`Total User: ${totalUsers}\nBroadcasting Message Started`);

                        // Loop through users in batches of 10
                        for (let i = 0; i < totalUsers; i += 10) {
                            const usersBatch = users.slice(i, i + 10);
                            for (const user of usersBatch) {
                                if (user.broadcast == true) {
                                    // if true then no need to send message again
                                } else {
                                    try {
                                        await ctx.telegram.forwardMessage(user.userId, messageToBroadcast.chat.id, messageToBroadcast.message_id);
                                        await client.db(dbName).collection('Users').updateOne({
                                            userId: user.userId
                                        }, {
                                            $set: {
                                                broadcast: true
                                            }
                                        });
                                        messagesSent++;
                                        await ctx.telegram.editMessageText(
                                            broadcastMessage.chat.id,
                                            broadcastMessage.message_id,
                                            null,
                                            `Total User: ${totalUsers}\nBroadcasting Message in Progress\nMessages Sent: ${messagesSent}/${totalUsers}`
                                        );
                                    } catch (error) {
                                        if (error.code === 429 && error.description.includes('FLOOD_WAIT')) {
                                            const secondsToWait = parseInt(error.parameters.retry_after) || 10;
                                            console.log(`Waiting for ${secondsToWait} seconds before retrying...`);
                                            await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
                                        } else if (error.code === 403 && error.description.includes('bot was blocked')) {
                                            console.log(`Forbidden: bot was blocked by the user ${user.userId}`);
                                            await client.db(dbName).collection('Users').deleteOne({
                                                userId: user.userId
                                            })
                                            blockedBy++;
                                        } else {
                                            console.log(`Error broadcasting message to user ${user.userId}:`, error);
                                        }
                                    }
                                }
                            }
                            // Wait for 5 seconds before processing the next batch
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }

                        try {
                            await ctx.telegram.editMessageText(
                                broadcastMessage.chat.id,
                                broadcastMessage.message_id,
                                null,
                                `📢 Message broadcasted successfully!\n👥 Total Users: ${totalUsers}\n✉️ Messages Sent successfully: ${messagesSent}\n\n🚫 Bot Blocked By ${blockedBy} users\n🗑️ And ${blockedBy} users who blocked me have been deleted.`
                            );
                            await client.db(dbName).collection('Users').updateMany({
                                broadcast: true
                            }, {
                                $set: {
                                    broadcast: false
                                }
                            });

                        } catch (error) {
                            console.error('Error editing broadcast message:', error);
                        }
                    } else {
                        ctx.reply('No message to broadcast.');
                    }
                } else {
                    ctx.reply('Reply to a message with /broadcast to broadcast it.');
                }
            }
        } catch (error) {
            bot.telegram.sendMessage(logId, `Error broadcasting message:`, error);
        }
    });
    bot.command('setting', async (ctx) => {
        try {
            // Check if user is an admin and the chat is private
            if (admins.includes(String(ctx.message.from.id)) && ctx.message.chat.type === 'private') {
                // Fetch existing settings from the database
                const existingEntry = await client.db(dbName).collection('BotSetting').findOne({
                    botName: botUsername
                });
                // Determine button text based on settings
                let shortLinkButtonText, fsubButtonText;
                if (existingEntry.shortLink === true) {
                    shortLinkButtonText = '🟢 ON'
                } else {
                    shortLinkButtonText = '🔴 OFF'
                }
                if (existingEntry.fsub === true) {
                    fsubButtonText = '🟢 ON'
                } else {
                    fsubButtonText = '🔴 OFF'
                }
                // Define inline keyboard
                const keyboard = [
                    [{
                            text: 'Short Link',
                            callback_data: 'slink'
                        },
                        {
                            text: shortLinkButtonText,
                            callback_data: 'shortlinkonoff'
                        }
                    ],
                    [{
                            text: 'F Sub',
                            callback_data: 'fsub'
                        },
                        {
                            text: fsubButtonText,
                            callback_data: 'fsubonoff'
                        }
                    ],
                    [{
                        text: '❌ Close',
                        callback_data: 'home'
                    }]
                ];

                // Send reply with inline keyboard
                await ctx.reply('Bot Setting:', {
                    reply_markup: {
                        inline_keyboard: keyboard
                    },
                    reply_to_message_id: ctx.message.message_id
                });
            }
        } catch (error) {
            // Log the error
            console.error(`Setting Error: ${error}`);
            await bot.telegram.sendMessage(logId, `Setting Error:\n${error}`);
        }
    });
    async function displayStartMessage(ctx) {
        const startMessage = await welcomeMessage(ctx);
        const keyboard = [
            [{
                text: 'ℹ️ ABOUT',
                callback_data: 'about'
            }],
            [{
                text: '⚙ FEATURES',
                callback_data: 'features'
            }, {
                text: '✨ PREMIUM',
                callback_data: 'premium'
            }],
            [{
                text: 'UPDATE CHANNEL',
                url: 'https://t.me/Pbail_Movie_Channel'
            }],
            [{
                text: 'Movies Request Group',
                url: 'https://t.me/PbailMovieRequestGroup'
            }]
        ];
        const replyMarkup = {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
        const sentMessage = await ctx.replyWithHTML(startMessage, replyMarkup);
        return sentMessage.message_id;
    }
    // Function to handle pagination button clicks
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data.split('_');
        const action = data[0];
        const messageId = ctx.callbackQuery.message.message_id;
        // await ctx.answerCbQuery('Wait, generating Token...');
        if (action === 'about') {
            // Edit the existing message
            const keyboard = [
                [{
                    text: '🏠 Home',
                    callback_data: 'home'
                }]
            ];
            const replyMarkup = {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, await aboutMessage(ctx), {
                ...replyMarkup,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } else if (action === 'features') {
            // Edit the existing message
            const keyboard = [
                [{
                    text: '🏠 Home',
                    callback_data: 'home'
                }]
            ];
            const replyMarkup = {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, await featuresMessage(ctx), {
                ...replyMarkup,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } else if (action === 'premium') {
            // Edit the existing message
            const keyboard = [
                [{
                    text: '💎 Buy Premium',
                    callback_data: 'buypremium'
                }],
                [{
                    text: '🏠 Home',
                    callback_data: 'home'
                }]
            ];

            const replyMarkup = {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, await premiumMessage(ctx), {
                ...replyMarkup,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } else if (action === 'home') {
            const keyboard = [
                [{
                    text: 'ℹ️ ABOUT',
                    callback_data: 'about'
                }],
                [{
                    text: '⚙ FEATURES',
                    callback_data: 'features'
                }, {
                    text: '✨ BUY PREMIUM',
                    callback_data: 'premium'
                }],
                [{
                    text: 'UPDATE CHANNEL',
                    url: 'https://t.me/anonymous_robots'
                }]
            ];
            const replyMarkup = {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            };
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, await welcomeMessage(ctx), {
                ...replyMarkup,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } else if (action === 'buypremium') {
            ctx.answerCbQuery(`Coming Soon `, {
                show_alert: true
            })
        } else if (action === 'file') {
            try {
                const fileUniqueId = data[1];
                const verified = await isVerified(ctx);
                const member = await isUserMember(ctx);
                if (verified && member) {
                    await ctx.answerCbQuery('Sending File... 📤');
                    ctx.sendChatAction('upload_document');
                    const existingEntry = await client.db(dbName).collection('Files').findOne({
                        fileUniqueId: fileUniqueId
                    });
                    try {
                        if (existingEntry.fileId) {
                            const file = ctx.sendDocument(existingEntry.fileId, {
                                caption: `This file will be deleted after 10 minutes. Please forward it to another chat before downloading.`
                            });
                            bot.telegram.sendMessage(logId, `User: <a href='tg://user?id=${ctx.callbackQuery.from.id}'>${ctx.callbackQuery.from.first_name} Downloaded File Scussfuly</a>`, {
                                parse_mode: 'HTML'
                            });

                            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id);

                            const deleteAfter = 10 * 60 * 1000;
                            setTimeout(async () => {
                                try {
                                    await ctx.deleteMessage((await file).message_id);
                                    ctx.reply(`File successfully 🚮 deleted after 10 minutes due to © copyright issues.`);
                                } catch (error) {
                                    bot.telegram.sendMessage(logId, `Error deleting message ${messageId}:`, error);
                                }
                            }, deleteAfter);
                        } else {
                            ctx.reply('File Not Found');
                            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id);
                        }
                    } catch (error) {
                        bot.telegram.sendMessage(logId, `Send File Error:`, error);
                    }
                } else {
                    const code = await generateVerificationCode();
                    const encryptedCode = await mixedCaesarCipher(code, 2);
                    const existingEntry = await client.db(dbName).collection('Users').findOne({
                        userId: ctx.callbackQuery.from.id
                    });
                    if (existingEntry) {
                        await client.db(dbName).collection('Users').updateOne({
                            userId: ctx.callbackQuery.from.id
                        }, {
                            $set: {
                                code: code
                            }
                        });
                    }
                    const tokenLink = `https://t.me/${botUsername}?start=t_${encryptedCode}_${fileUniqueId}_${messageId}`;
                    const verificationLink = await generateLink(tokenLink, ctx);

                    // Edit the existing message
                    let fileMessage = '';
                    const keyboard = [];
                    if (!member) {
                        keyboard.push([{
                            text: 'Join Update Channel',
                            url: 'https://t.me/anonymous_robots'
                        }]);
                        fileMessage = fileMessage.concat('👉🏻 First Join Update Channel\n');
                    }
                    if (!verified) {
                        keyboard.push([{
                            text: 'Verify Token',
                            url: verificationLink
                        }]);
                        fileMessage = fileMessage.concat('👉🏻 Verify Your Token\n');
                    }
                    keyboard.push([{
                        text: 'Download File',
                        callback_data: `file_${fileUniqueId}`
                    }]);
                    fileMessage = fileMessage.concat('Then Click On Download');

                    await ctx.answerCbQuery('🛑 You need to verify your token and join the update channel to download the file.', {
                        show_alert: true
                    });

                    const replyMarkup = {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    };
                    try {
                        await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, fileMessage, {
                            ...replyMarkup,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                    } catch (error) {
                        // Handle error if editing message fails
                    }
                }

            } catch (error) {
                console.log(error);
            }
        } else if (action === 'shortlinkonoff') {
            try {
                // Update button text to reflect the change
                const existingEntry = await client.db(dbName).collection('BotSetting').findOne({
                    botName: botUsername
                });
                // Determine button text based on settings
                let shortLinkButtonText, fsubButtonText;

                if (existingEntry.shortLink === true) {
                    await client.db(dbName).collection('BotSetting').updateOne({
                        botName: botUsername
                    }, {
                        $set: {
                            shortLink: false
                        }
                    });
                    shortLinkButtonText = '🔴 OFF'
                } else {
                    await client.db(dbName).collection('BotSetting').updateOne({
                        botName: botUsername
                    }, {
                        $set: {
                            shortLink: true
                        }
                    });
                    shortLinkButtonText = '🟢 ON'
                }

                if (existingEntry.fsub === true) {
                    fsubButtonText = '🟢 ON'
                } else {
                    fsubButtonText = '🔴 OFF'
                }

                // Define inline keyboard
                const keyboard = [
                    [{
                            text: 'Short Link',
                            callback_data: 'slink'
                        },
                        {
                            text: shortLinkButtonText,
                            callback_data: 'shortlinkonoff'
                        }
                    ],
                    [{
                            text: 'F Sub',
                            callback_data: 'fsub'
                        },
                        {
                            text: fsubButtonText,
                            callback_data: 'fsubonoff'
                        }
                    ],
                    [{
                        text: '❌ Close',
                        callback_data: 'home'
                    }]
                ];
                const replyMarkup = {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                };
                await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, 'Bot Setting Changed', {
                    ...replyMarkup,
                });

                // Inform the user about the change
                await ctx.answerCbQuery('Setting Changed');
            } catch (error) {
                console.error(error);
            }
        } else if (action === 'fsubonoff') {
            try {
                // Update button text to reflect the change
                const existingEntry = await client.db(dbName).collection('BotSetting').findOne({
                    botName: botUsername
                });
                // Determine button text based on settings
                let shortLinkButtonText, fsubButtonText;

                if (existingEntry.shortLink === true) {
                    shortLinkButtonText = '🟢 ON'
                } else {
                    shortLinkButtonText = '🔴 OFF'
                }

                if (existingEntry.fsub === true) {
                    await client.db(dbName).collection('BotSetting').updateOne({
                        botName: botUsername
                    }, {
                        $set: {
                            fsub: false
                        }
                    });
                    fsubButtonText = '🔴 OFF'
                } else {
                    await client.db(dbName).collection('BotSetting').updateOne({
                        botName: botUsername
                    }, {
                        $set: {
                            fsub: true
                        }
                    });
                    fsubButtonText = '🟢 ON'
                }

                // Define inline keyboard
                const keyboard = [
                    [{
                            text: 'Short Link',
                            callback_data: 'slink'
                        },
                        {
                            text: shortLinkButtonText,
                            callback_data: 'shortlinkonoff'
                        }
                    ],
                    [{
                            text: 'F Sub',
                            callback_data: 'fsub'
                        },
                        {
                            text: fsubButtonText,
                            callback_data: 'fsubonoff'
                        }
                    ],
                    [{
                        text: '❌ Close',
                        callback_data: 'home'
                    }]
                ];
                const replyMarkup = {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                };
                await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, 'Bot Setting Changed', {
                    ...replyMarkup,
                });

                // Inform the user about the change
                await ctx.answerCbQuery('Setting Changed');
            } catch (error) {
                console.error(error);
            }
        } else if (action === 'slink') {
            ctx.answerCbQuery(`This is button For Shortlink On Off`, {
                show_alert: true
            })
        } else if (action === 'fsub') {
            ctx.answerCbQuery(`This is button For Fsub On Off`, {
                show_alert: true
            })
        } else {
            ctx.answerCbQuery(`Something Went Wrong 😢`, {
                show_alert: true
            })
        }
    });
    // Function to start pagination
    bot.command('start', async (ctx) => {
        try {
            userRegister(ctx)
            const commandParts = ctx.message.text.split(' ');
            if (commandParts.length > 1 && commandParts[1].startsWith('file_') && ctx.message.chat.type === 'private') {
                try {
                    const fileUniqueId = commandParts[1].slice(5);
                    const existingEntry = await client.db(dbName).collection('Files').findOne({
                        fileUniqueId: fileUniqueId
                    });
                    if (existingEntry && existingEntry.fileId) {
                        await ctx.replyWithHTML(`<b>📁File Details</b>\n\n<b>File Name:</b> ${existingEntry.fileName}\n\n<b>File Size:</b> ${existingEntry.fileSize}\n\n<b>MimeType:</b> ${existingEntry.mimeType}`, {
                            reply_markup: {
                                inline_keyboard: [
                                    [{
                                        text: 'Download File',
                                        callback_data: commandParts[1]
                                    }]
                                ]
                            }
                        });
                    } else {
                        ctx.reply('File Not Found');
                    }
                } catch (error) {

                }
            } else if (commandParts.length > 1 && commandParts[1].startsWith('t_') && ctx.message.chat.type === 'private') {
                try {
                    const commandParts = ctx.message.text.split('_');
                    const token = commandParts[1];
                    const fileUniqueId = commandParts[2];
                    const messageId = commandParts[3];

                    const existingEntry = await client.db(dbName).collection('Users').findOne({
                        userId: ctx.message.from.id
                    });
                    if (existingEntry.isVerified === true) {
                        ctx.react('⚡')
                        ctx.reply('You are already verified.')
                    } else {
                        const decryptedCode = mixedCaesarCipher(token, -2);

                        if (existingEntry.code == decryptedCode) {
                            const currentDate = new Date();
                            await client.db(dbName).collection('Users').updateOne({
                                userId: ctx.message.from.id
                            }, {
                                $set: {
                                    code: 0,
                                    isVerified: true,
                                    vDate: currentDate,
                                }
                            });
                            ctx.react('🔥')
                            const vmess = ctx.reply('Verification Successful!');

                            // Edit the existing message
                            const existingEntry = await client.db(dbName).collection('Files').findOne({
                                fileUniqueId: fileUniqueId
                            });
                            const fileMessage = `<b>📁File Details</b>\n\n<b>File Name:</b> ${existingEntry.fileName}\n\n<b>File Size:</b> ${existingEntry.fileSize}\n\n<b>MimeType:</b> ${existingEntry.mimeType}`

                            const keyboard = [
                                [{
                                    text: 'Download File',
                                    callback_data: `file_${fileUniqueId}`
                                }]
                            ];

                            const replyMarkup = {
                                reply_markup: {
                                    inline_keyboard: keyboard
                                }
                            };
                            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, fileMessage, {
                                ...replyMarkup,
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            try {
                                ctx.deleteMessage((await vmess).message_id)
                            } catch (error) {}
                        } else {
                            ctx.react('💩')
                            ctx.reply('Verification Failed. Retry!');
                        }
                    }

                } catch (error) {

                }

            } else {
                if (ctx.message.chat.type === 'private') {
                    displayStartMessage(ctx)
                } else {
                    ctx.react('🤪')
                    ctx.replyWithHTML(`I'am Alive!`)
                }
            }
        } catch (error) {

        }
    });
    bot.on('message', async (ctx) => {
        try {
            if (ctx.message.document || ctx.message.audio || ctx.message.photo || ctx.message.video || ctx.message.voice || ctx.message.video_note && ctx.chat.type === 'private') {
                ctx.react('🤝')
                let fileName;
                let fileSize;
                let fileUniqueId;
                let fileId;
                let mimeType;

                if (ctx.message.document) {
                    fileName = ctx.message.document.file_name;
                    fileSize = await humanReadableFileSize(ctx.message.document.file_size);
                    fileUniqueId = ctx.message.document.file_unique_id;
                    fileId = ctx.message.document.file_id;
                    mimeType = ctx.message.document.mime_type;
                } else if (ctx.message.audio) {
                    fileName = ctx.message.audio.file_name;
                    fileSize = await humanReadableFileSize(ctx.message.audio.file_size);
                    fileUniqueId = ctx.message.audio.file_unique_id;
                    fileId = ctx.message.audio.file_id;
                    mimeType = 'audio/' + ctx.message.audio.mime_type.split('/')[1];
                } else if (ctx.message.photo) {
                    fileName = 'Unknown Photo';
                    fileSize = await humanReadableFileSize(ctx.message.photo.file_size);
                    fileUniqueId = ctx.message.photo.file_unique_id;
                    fileId = ctx.message.photo.file_id;
                    mimeType = ctx.message.photo.mime_type || 'image/jpeg';
                } else if (ctx.message.video) {
                    fileName = ctx.message.video.file_name || 'Unknown Video';
                    fileSize = await humanReadableFileSize(ctx.message.video.file_size);
                    fileUniqueId = ctx.message.video.file_unique_id;
                    fileId = ctx.message.video.file_id;
                    mimeType = ctx.message.video.mime_type;
                } else if (ctx.message.voice) {
                    fileName = 'Voice Message';
                    fileSize = await humanReadableFileSize(ctx.message.voice.file_size);
                    fileUniqueId = ctx.message.voice.file_unique_id;
                    fileId = ctx.message.voice.file_id;
                    mimeType = ctx.message.voice.mime_type || 'audio/ogg';
                } else if (ctx.message.video_note) {
                    fileName = 'Video Note';
                    fileSize = await humanReadableFileSize(ctx.message.video_note.file_size);
                    fileUniqueId = ctx.message.video_note.file_unique_id;
                    fileId = ctx.message.video_note.file_id;
                    mimeType = ctx.message.video_note.mime_type || 'video/mp4';
                }

                const existingEntry = await client.db(dbName).collection('Files').findOne({
                    fileUniqueId: fileUniqueId
                });
                if (existingEntry) {
                    try {
                        const link = `https://t.me/${botUsername}?start=file_${existingEntry.fileUniqueId}`;
                        await ctx.replyWithHTML(`<b>📁File Details</b>\n\n<b>File Name:</b> ${existingEntry.fileName}\n\n<b>File Size:</b> ${existingEntry.fileSize}\n\n<b>MimeType:</b> ${existingEntry.mimeType}`, {
                            reply_markup: {
                                inline_keyboard: [
                                    [{
                                        text: 'Get File Details',
                                        url: link,
                                    }]
                                ]
                            },
                            reply_to_message_id: ctx.message.message_id
                        });
                    } catch (error) {}
                } else {
                    try {
                        await ctx.forwardMessage(dbId, ctx.message)
                        await client.db(dbName).collection('Files').insertOne({
                            fileName: fileName,
                            fileSize: fileSize,
                            fileUniqueId: fileUniqueId,
                            fileId: fileId,
                            mimeType: mimeType,
                        });

                        try {
                            const link = `https://t.me/${botUsername}?start=file_${fileUniqueId}`
                            await ctx.replyWithHTML(`<b>📁File Details</b>\n\n<b>File Name:</b> ${fileName}\n\n<b>File Size:</b> ${fileSize}\n\n<b>MimeType:</b> ${mimeType}`, {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{
                                            text: 'Get File Details',
                                            url: link,
                                        }]
                                    ]
                                },
                                reply_to_message_id: ctx.message.message_id
                            });
                            await ctx.telegram.sendMessage(forwardChannelId, `<b>📁 File Details</b>\n\n<b>File Name:</b> ${fileName}\n\n<b>File Size:</b> ${fileSize}\n\n<b>MimeType:</b> ${mimeType}`, {
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{
                                            text: 'Get File Details',
                                            url: link,
                                        }]
                                    ]
                                }
                            });

                        } catch (error) {

                        }
                    } catch (error) {

                    }
                }
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
    // check users
    checkAndUpdateUsers();
    setInterval(checkAndUpdateUsers, 5 * 60 * 1000);

    /////////////////////////////////////
    async function checkAndUpdateUsers() {
        try {

            // Calculate 24 hours ago from now
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            // Find users where vDate is older than 24 hours
            const query = {
                vDate: {
                    $lt: twentyFourHoursAgo
                }
            };
            const usersToUpdate = await client.db(dbName).collection('Users').find(query).toArray();

            // Update users
            const updatePromises = usersToUpdate.map(user => {
                return client.db(dbName).collection('Users').updateOne({
                    _id: user._id
                }, {
                    $set: {
                        isVerified: false,
                        vDate: 0
                    }
                });
            });
            await Promise.all(updatePromises);

            console.log("Users checked and updated successfully.");
        } catch (error) {
            console.error('Error checking and updating users:', error);
        }
    }
    ///////////////////////////////////////////
    async function userRegister(ctx) {
        const existingEntry = await client.db(dbName).collection('Users').findOne({
            userId: ctx.message.from.id
        });
        const currentDate = new Date();

        function formatDate(date) {
            const d = date.getDate().toString().padStart(2, '0');
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const y = date.getFullYear().toString().slice(-2);
            return `${d}-${m}-${y}`;
        }
        if (!existingEntry) {
            try {
                bot.telegram.sendMessage(logId, `New User: <a href='tg://user?id=${ctx.message.from.id}'>${ctx.message.from.first_name}</a>`, {
                    parse_mode: 'HTML'
                });
                const formattedDate = formatDate(currentDate);
                await client.db(dbName).collection('Users').insertOne({
                    userId: ctx.message.from.id,
                    joinDate: formattedDate,
                    code: 0,
                    isVerified: false,
                    vDate: 0,
                    shortner: false,
                });
            } catch (error) {
                bot.telegram.sendMessage(logId, `New User: ${ctx.message.from.first_name}`);
            }
        }
    }
    async function isVerified(ctx) {
        const existingEntry = await client.db(dbName).collection('BotSetting').findOne({
            botName: botUsername
        });
        if (existingEntry.shortLink === false) {
            return true;
        } else {
            try {
                let userId;
                if (ctx.callbackQuery) {
                    userId = ctx.callbackQuery.from.id
                } else {
                    userId = ctx.message.from.id
                }
                const existingEntry = await client.db(dbName).collection('Users').findOne({
                    userId: userId
                });
                return existingEntry && existingEntry.isVerified === true;
            } catch (error) {
                console.error('Error checking token verify:', error);
                // Handle the error or re-throw it if necessary
                throw error;
            }
        }
    }
    async function isUserMember(ctx) {
        const existingEntry = await client.db(dbName).collection('BotSetting').findOne({
            botName: botUsername
        });
        if (existingEntry.shortLink === false) {
            return true;
        } else {
            try {
                let userId;
                if (ctx.callbackQuery) {
                    userId = ctx.callbackQuery.from.id
                } else {
                    userId = ctx.message.from.id
                }
                const result = await ctx.telegram.getChatMember(channelId, userId);
                return result && ['member', 'administrator', 'creator'].includes(result.status);
            } catch (error) {
                console.error('Error checking channel membership:', error);
                // Handle the error or re-throw it if necessary
                throw error;
            }
        }
    }

    function mixedCaesarCipher(code, shift, mode = 'encrypt') {
        if (code.length !== 6) {
            throw new Error('Input must be a 6-character code.');
        }

        const alphabet = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase() + '0123456789';
        const charMap = new Map();

        for (let i = 0; i < alphabet.length; i++) {
            charMap.set(alphabet[i], (i + shift) % alphabet.length);
        }

        const result = code.split('').map(char => {
            const shiftedChar = charMap.get(char.toUpperCase());
            return shiftedChar !== undefined ? alphabet[shiftedChar] : char;
        });

        return result.join('');
    }
    async function generateVerificationCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            code += characters[randomIndex];
        }
        return code.toUpperCase();
    }
    async function generateLink(destination, ctx) {
        try {
            let userId;
            if (ctx.callbackQuery) {
                userId = ctx.callbackQuery.from.id
            } else {
                userId = ctx.message.from.id
            }
            const existingEntry = await client.db(dbName).collection('Users').findOne({
                userId: userId
            });
            if (existingEntry.shortner === false) {
                const link = await shareusUrl(destination, ctx)
                return link
            } else {
                const link = await vpUrl(destination, ctx)
                return link
            }
        } catch (error) {
            bot.telegram.sendMessage(logId, `Shortlink Genrate Error :\n${error}`);
        }
    }
    async function shareusUrl(destination, ctx) {
        const apiUrl = "https://api.shareus.io/easy_api";
        const queryParams = new URLSearchParams({
            key: "el1tMDiNFJXKaVrQvjkCiYApEUp2",
            link: destination
        });
        const apiUrlWithParams = `${apiUrl}?${queryParams}`;
        try {
            const response = await fetch(apiUrlWithParams);

            if (!response.ok) {
                throw new Error(`Error: ${response.statusText}`);
            }
            await client.db(dbName).collection('Users').updateOne({
                userId: ctx.callbackQuery.from.id
            }, {
                $set: {
                    shortner: true,
                }
            });

            const result = await response.text();
            return result;
        } catch (error) {
            console.log('Error in Genrating Link:', error.message);
        }
    }
    async function vpUrl(destination, ctx) {
        const apiUrl = `https://vplink.in/api?api=35328c26c67459cd6c607b527c4672fa0e67dde2&url=${destination}&format=text`;
        try {
            let userId;
            if (ctx.callbackQuery) {
                userId = ctx.callbackQuery.from.id
            } else {
                userId = ctx.message.from.id
            }
            const response = await fetch(apiUrl);
            if (!response.ok) {
                return `Failed to shorten URL: ${response.status} ${response.statusText}`;
            }
            await client.db(dbName).collection('Users').updateOne({
                userId: userId
            }, {
                $set: {
                    shortner: false,
                }
            });
            return await response.text();
        } catch (error) {
            return `Network error: ${error.message}`;
        }
    }
    async function humanReadableFileSize(bytes) {
        const thresh = 1024; // adjust for IEC units (1024) or SI units (1000)
        if (Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }
        const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
        let u = -1;
        const r = 10;
        do {
            bytes /= thresh;
            ++u;
        } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
        return bytes.toFixed(2) + ' ' + units[u];
    }
    ///////////////////////////////////////////
    async function welcomeMessage(ctx) {
        let id;
        let name;
        if (ctx.callbackQuery) {
            id = ctx.callbackQuery.from.id
            name = ctx.callbackQuery.from.first_name
        } else {
            id = ctx.message.from.id
            name = ctx.message.from.first_name
        }
        const welcomeMessage = `
📁 <b>Welcome to @${botUsername}!</b> 🤖

<b><a href='tg://user?id=${id}'>${name}</a></b>
<blockquote>🚀 I am your advanced AI file manager, designed to streamline your file sharing experience.</blockquote>
<blockquote>With Me, you can effortlessly generate shareable links for your files!</blockquote>
<b>MAINTAINED BY : <a href='tg://user?id=5397992078'>Ｄａｒｋ Ｄｅｖｉｌ</a></b>
`
        return welcomeMessage;
    }
    async function aboutMessage(ctx) {
        let id;
        let name;
        if (ctx.callbackQuery) {
            id = ctx.callbackQuery.from.id
            name = ctx.callbackQuery.from.first_name
        } else {
            id = ctx.message.from.id
            name = ctx.message.from.first_name
        }
        const aboutMessage = `
<b>ℹ About Us ℹ \n\n<a href='tg://user?id=${id}'>${name}</a></b> 

🤖 I am @${botUsername}
⚙️ ᴄʜɪʟʟɪɴɢ ᴏɴ : <a href='https://id.heroku.com/'>ʜᴇʀᴏᴋᴜ</a>
🍿 ʙʀᴀɪɴ ғᴜᴇʟᴇᴅ : <a href='https://www.mongodb.com/'>ᴍᴏɴɢᴏ ᴅʙ</a>
⚡ ᴄᴏᴅɪɴɢ ᴍᴜsᴄʟᴇs : <a href='https://nodejs.org/'>NODEJS</a>
😚 ᴍʏ ᴛʀᴜsᴛʏ sᴛᴇᴇᴅ: <a href='https://telegraf.js.org/'>TELEGRAF</a>
🤡 ᴍʏ ᴍᴀɴᴀɢᴇʀ : <a href='tg://user?id=5397992078'>Ｄａｒｋ Ｄｅｖｉｌ</a>
`
        return aboutMessage;
    }
    async function featuresMessage(ctx) {
        let id, name;
        if (ctx.callbackQuery) {
            id = ctx.callbackQuery.from.id;
            name = ctx.callbackQuery.from.first_name;
        } else {
            id = ctx.message.from.id;
            name = ctx.message.from.first_name;
        }
        const featuresMessage = `
🤖 <b>My Features: What I Can Do</b> 🛠\n\n
Hey <a href='tg://user?id=${id}'>${name}</a>, here's what I can do for you:\n\n
📁 I am @${botUsername}, and I specialize in file management.\n
📩 I can store files and provide you with a shareable link. Users can download files using this link, and the links never expire. I also provide /setting to toggle force subscribe and short link(Only Group Admin).\n
💰 Coming soon: Earn money with me!\n\n
⬇<b> How to Download Files </b>⬇\n
When you open the link, you'll see file details like file name, size, etc., along with a download button. If the download button is not visible, you need to join our channel and verify your token. Once you join and verify, the download button will become visible. This download button is visible only to users who have joined our channel and verified their token.\n
📝<b> NOTE: </b>Verified token users can download the file directly for 6 hours. After that, you'll need to verify your token again.\n
✨<b> Premium Users: </b>Premium users can download the file directly without needing to join our channel or verify their token.
`;
        return featuresMessage;
    }
    async function premiumMessage(ctx) {
        let id, name;
        if (ctx.callbackQuery) {
            id = ctx.callbackQuery.from.id;
            name = ctx.callbackQuery.from.first_name;
        } else {
            id = ctx.message.from.id;
            name = ctx.message.from.first_name;
        }

        const premiumMessage = `
<b>✨ OUR PREMIUM SERVICE ✨</b>\n\n
Hey <a href='tg://user?id=${id}'>${name}</a>, thank you for considering our premium service! Here's what we offer:\n
- Direct file download without needing to join our channel or verify token.\n
- Priority support and access to exclusive features.\n
- Ad-free experience and faster file processing.\n
<b>Beta Features Available for Premium Users:</b>\n
- Early access to beta features and updates.\n
- Opportunity to provide feedback and shape future developments.\n\n
To upgrade to our premium service and gain access to these exclusive features. We'll be happy to assist you further!\n<b>Available Soon!</b>
`;
        return premiumMessage;
    }
}


async function initializingBot() {
    try {
        console.log('initializing The Bot Setup\nPower By Anonymous Robots');
        await client.connect();
        const botSettingCollection = client.db(dbName).collection('BotSetting');
        const existingEntry = await botSettingCollection.findOne({
            botName: botUsername
        });

        if (!existingEntry) {
            await botSettingCollection.insertOne({
                botName: botUsername,
                shortLink: true,
                fsub: true
            });
            console.log('BotSetting created with shortLink/Fsub set to ON.');
        }

        main()
    } catch (error) {
        bot.telegram.sendMessage(logId, `Error initializing BotSetting:\n${error}`);
    }
}
// Start polling
bot.startPolling();
initializingBot()