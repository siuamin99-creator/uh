process.on('uncaughtException', (err) => {
    console.error('\x1b[31m[Uncaught Exception]\x1b[0m', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[Unhandled Rejection]\x1b[0m', reason);
});

// Keep process active in headless container environments
if (process.stdin.isTTY === false || !process.stdin.listening) {
    try { process.stdin.resume(); } catch (e) { }
}
setInterval(() => { }, 30000);

if (typeof globalThis.File === 'undefined') {
    const { Blob } = require('buffer');
    globalThis.File = class File extends Blob {
        constructor(sources, fileName, options = {}) {
            super(sources, options);
            this.name = fileName;
            this.lastModified = options.lastModified || Date.now();
        }
    };
}

const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { Shoukaku, Connectors } = require('shoukaku');
const play = require('play-dl');
const yts = require('yt-search');

// Prepend ffmpeg-static to process.env.PATH so @discordjs/voice/prism-media can find it automatically

// Load config
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
    console.error('\x1b[31m[Error] config.json is missing! Please create it.\x1b[0m');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (!config.token || config.token === 'YOUR_DISCORD_USER_TOKEN') {
    console.error('\x1b[31m[Error] Please set your actual Discord User Token in config.json!\x1b[0m');
    process.exit(1);
}

class SelfbotDiscordJSConnector extends Connectors.DiscordJS {
    listen(nodes) {
        this.client.once('ready', () => this.ready(nodes));
        this.client.once('clientReady', () => this.ready(nodes));
        this.client.on('raw', (packet) => this.raw(packet));
    }
}

const client = new Client({
    checkUpdate: false,
    patchVoice: true,
    ws: {
        properties: {
            $os: 'Windows',
            $browser: 'Discord Client',
            $device: 'Desktop'
        }
    }
});

let prefix = config.prefix || '>';

// Setup Spotify credentials if available
if (config.spotify_client_id && config.spotify_client_secret) {
    play.setToken({
        spotify: {
            client_id: config.spotify_client_id,
            client_secret: config.spotify_client_secret
        }
    }).then(() => {
        console.log('\x1b[32m[Success] Spotify integration configured.\x1b[0m');
    }).catch(err => {
        console.warn(`\x1b[33m[Warning] Spotify setup failed: ${err.message}\x1b[0m`);
    });
} else {
    console.log('\x1b[33m[Info] Spotify credentials not set in config.json. Spotify URLs may not work.\x1b[0m');
}

const defaultNodes = [
    {
        name: "Public Node 1 (Serenetia v4 SSL)",
        url: "lavalinkv4.serenetia.com:443",
        auth: "https://seretia.link/discord",
        secure: true
    },
    {
        name: "Public Node 2 (Millohost v4)",
        url: "lava-v4.millohost.my.id:443",
        auth: "https://discord.gg/mjS5J2K3ep",
        secure: true
    },
    {
        name: "Public Node 3 (Kasawa v4)",
        url: "lava2.kasawa.pro:2334",
        auth: "youshallnotpass",
        secure: false
    },
    {
        name: "Public Node 4 (Serenetia v4 80)",
        url: "lavalinkv4.serenetia.com:80",
        auth: "https://seretia.link/discord",
        secure: false
    }
];

const nodesToConnect = config.lavalink_nodes && config.lavalink_nodes.length > 0 ? config.lavalink_nodes : defaultNodes;

const shoukaku = new Shoukaku(new SelfbotDiscordJSConnector(client), nodesToConnect, {
    moveOnDisconnect: true,
    resume: true,
    resumeTimeout: 30,
    reconnectInterval: 5000,
    reconnectTries: 5
});

shoukaku.on('error', (name, error) => console.error(`[Lavalink Error] Node: ${name} ->`, error));
shoukaku.on('ready', (name) => console.log(`\x1b[32m[Lavalink Ready] Node: ${name}\x1b[0m`));
shoukaku.on('close', (name, code, reason) => console.log(`[Lavalink Closed] Node: ${name} with code ${code}, reason: ${reason}`));
shoukaku.on('disconnect', (name, players, moved) => console.warn(`[Lavalink Disconnected] Node: ${name}. Players moved: ${moved}`));

// Setup SoundCloud integration
play.getFreeClientID().then(clientId => {
    play.setToken({
        soundcloud: {
            client_id: clientId
        }
    });
    console.log('\x1b[32m[Success] SoundCloud integration configured.\x1b[0m');
}).catch(err => {
    console.warn(`\x1b[33m[Warning] SoundCloud setup failed: ${err.message}\x1b[0m`);
});

// Helper to clean YouTube titles for a better search match on SoundCloud
function cleanTitleForSearch(title) {
    if (!title) return '';
    return title
        .replace(/\(.*?\)/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/official\s+video/gi, '')
        .replace(/official\s+music\s+video/gi, '')
        .replace(/music\s+video/gi, '')
        .replace(/lyric\s+video/gi, '')
        .replace(/lyrics/gi, '')
        .replace(/[|:\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}


// Music State
let queue = [];
let shoukakuPlayer = null;
let loopStatus = 'none'; // 'none' | 'song' | 'queue'
let currentVolume = 1.0;
let is247 = false;
let isAutoplay = false;
let connectedChannelName = null;
let connectedGuildName = null;

const RANDOM_AUTOPLAY_QUERIES = [
    'lofi hip hop beats to relax study to',
    'trending music mix 2026',
    'chill lofi beats mix',
    'top pop music hits',
    'acoustic relax playlist',
    'synthwave retro chill mix',
    'bangla popular songs mix',
    'top gaming music mix',
    'deep focus lofi chill'
];

async function playAutoplaySong(textChannel = null) {
    if (queue.length > 0) return;
    const randomQuery = RANDOM_AUTOPLAY_QUERIES[Math.floor(Math.random() * RANDOM_AUTOPLAY_QUERIES.length)];
    console.log(`\x1b[35m[24/7 Autoplay] Queue empty. Resolving random song for query: "${randomQuery}"...\x1b[0m`);
    try {
        const songs = await resolveSong(randomQuery);
        if (songs && songs.length > 0) {
            const randomTrack = songs[Math.floor(Math.random() * songs.length)];
            queue.push(randomTrack);
            if (textChannel) {
                sendTempResponse(textChannel, `🎲 **[24/7 Autoplay] Playing random track:** \`${randomTrack.title}\``, 8000);
            }
            playSong(textChannel);
        }
    } catch (err) {
        console.error(`[24/7 Autoplay Error] Failed to fetch random song:`, err.message);
    }
}

function handleTrackEnd() {
    if (loopStatus === 'song') {
        playSong(null);
    } else if (loopStatus === 'queue') {
        const currentSong = queue.shift();
        if (currentSong) {
            if (currentSong.source === 'spotify') {
                currentSong.url = null;
                currentSong.lavalinkTrack = null;
            }
            queue.push(currentSong);
        }
        playSong(null);
    } else {
        queue.shift();
        if (queue.length === 0 && (isAutoplay || is247)) {
            playAutoplaySong(null);
        } else {
            playSong(null);
        }
    }
}

function handlePlaybackError(error) {
    console.error(`Lavalink playback error: ${error.message || error}`);
    if (loopStatus === 'queue') {
        const currentSong = queue.shift();
        if (currentSong) {
            if (currentSong.source === 'spotify') {
                currentSong.url = null;
                currentSong.lavalinkTrack = null;
            }
            queue.push(currentSong);
        }
        playSong(null);
    } else {
        queue.shift();
        playSong(null);
    }
}

function cleanupPlayerState() {
    shoukakuPlayer = null;
    queue = [];
    loopStatus = 'none';
    connectedChannelName = null;
    connectedGuildName = null;
}

// Helper to automatically find target voice channel
async function getTargetVoiceChannel(message = null, targetOwnerId = null) {
    if (message && message.member?.voice?.channel) {
        return message.member.voice.channel;
    }

    const ownerIds = targetOwnerId && targetOwnerId !== 'auto'
        ? [targetOwnerId]
        : (config.owner_ids || []);

    for (const ownerId of ownerIds) {
        for (const guild of client.guilds.cache.values()) {
            const voiceState = guild.voiceStates.cache.get(ownerId);
            if (voiceState && voiceState.channelId) {
                const channel = await client.channels.fetch(voiceState.channelId).catch(() => null);
                if (channel && (channel.type === 'GUILD_VOICE' || channel.type === 'GUILD_STAGE_VOICE')) {
                    return channel;
                }
            }
        }
    }

    return null;
}

// Unified helper to connect to a voice channel via Shoukaku
async function connectToVoiceChannel(channel) {
    if (shoukakuPlayer) {
        // If already connected to the same channel, do nothing
        if (shoukakuPlayer.channelId === channel.id) {
            connectedChannelName = channel.name || connectedChannelName;
            connectedGuildName = channel.guild?.name || connectedGuildName;
            return shoukakuPlayer;
        }

        // Save current state before leaving to prevent losing active queue/volume settings
        const oldGuildId = shoukakuPlayer.guildId;
        const savedQueue = [...queue];
        const savedLoop = loopStatus;
        const savedVolume = currentVolume;

        cleanupPlayerState();
        await shoukaku.leaveVoiceChannel(oldGuildId).catch(() => { });

        queue = savedQueue;
        loopStatus = savedLoop;
        currentVolume = savedVolume;
    }

    connectedChannelName = channel.name || null;
    connectedGuildName = channel.guild ? channel.guild.name : null;

    const player = await shoukaku.joinVoiceChannel({
        guildId: channel.guild.id,
        channelId: channel.id,
        shardId: 0
    });

    shoukakuPlayer = player;

    player.on('start', (track) => {
        if (shoukakuPlayer !== player) return;
        console.log(`[Lavalink Player] Started playing: ${track.track}`);
    });

    player.on('end', (data) => {
        if (shoukakuPlayer !== player) return;
        if (data.reason === 'REPLACED') return;
        console.log(`[Lavalink Player] Track ended. Reason: ${data.reason}`);
        handleTrackEnd();
    });

    player.on('exception', (error) => {
        if (shoukakuPlayer !== player) return;
        console.error('[Lavalink Player] Exception:', error);
        handlePlaybackError(error);
    });

    player.on('closed', (data) => {
        console.warn('[Lavalink Player] Connection closed:', data);
        if (shoukakuPlayer === player) {
            cleanupPlayerState();
        }
    });

    return player;
}

// Spotify Embed Scraper helper for premium tokenless resolution
async function fetchSpotifyEmbedTracks(url) {
    const embedUrl = url.replace(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/, 'open.spotify.com/embed/$1/$2');
    const response = await fetch(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Spotify embed page: ${response.statusText}`);
    }

    const html = await response.text();
    const regex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
    const match = html.match(regex);
    if (!match) {
        throw new Error('Could not find Spotify Next.js hydration data.');
    }

    const nextData = JSON.parse(match[1]);
    const pageProps = nextData.props?.pageProps;

    // Check if the link is not found or private (returns 404 or Page not found)
    if (pageProps?.status === 404 || pageProps?.title === 'Page not found') {
        throw new Error('The Spotify link is invalid, or the playlist/album is PRIVATE. Please make sure your playlist is set to PUBLIC.');
    }

    const entity = pageProps?.state?.data?.entity;
    if (!entity) {
        throw new Error('Spotify metadata not found. Make sure the link is valid and public.');
    }

    let tracks = [];
    if (entity.type === 'track') {
        const title = entity.title || entity.name;
        const artists = entity.subtitle || '';
        tracks = [{ title, artists }];
    } else if (entity.type === 'playlist' || entity.type === 'album') {
        const items = entity.trackList || [];
        tracks = items.map(item => ({
            title: item.title,
            artists: item.subtitle || ''
        }));
    }
    return tracks;
}

// Resolve query helper
async function resolveSong(query) {
    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (!node) {
        throw new Error('No active Lavalink nodes found to resolve tracks.');
    }

    const sanitizeUrl = (url) => {
        if (url && /youtube\.com/i.test(url) && !/www\.youtube\.com/i.test(url)) {
            return url.replace(/youtube\.com/i, 'www.youtube.com');
        }
        return url;
    };

    // Spotify Track, Playlist or Album
    const isSpotify = /open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/.test(query);
    if (isSpotify) {
        try {
            const tracks = await fetchSpotifyEmbedTracks(query);
            if (tracks.length === 0) {
                throw new Error('Spotify track/playlist/album is empty or has no accessible tracks.');
            }
            return tracks.map(track => {
                const title = track.artists ? `${track.title} - ${track.artists}` : track.title;
                return {
                    title: title,
                    url: null,
                    query: query,
                    source: 'spotify',
                    searchKeyword: track.artists ? `${track.title} ${track.artists}` : track.title
                };
            });
        } catch (err) {
            throw new Error(`Spotify resolution failed: ${err.message}`);
        }
    }

    // Default resolution for direct URL or search queries
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const searchPrefix = isUrl ? '' : 'ytsearch:';
    const resolveQuery = isUrl ? sanitizeUrl(query) : `${searchPrefix}${query}`;

    let result = await node.rest.resolve(resolveQuery);

    if (result.loadType === 'empty' || result.loadType === 'error' || !result.data) {
        if (!isUrl && searchPrefix === 'ytsearch:') {
            const scResult = await node.rest.resolve(`scsearch:${query}`);
            if (scResult.loadType !== 'empty' && scResult.loadType !== 'error' && scResult.data?.length > 0) {
                const track = scResult.data[0];
                return [{
                    title: track.info.title,
                    url: track.info.uri,
                    source: 'soundcloud',
                    lavalinkTrack: track.encoded
                }];
            }
        }
        throw new Error(result.exception?.message || 'No matches found on Lavalink.');
    }

    if (result.loadType === 'track') {
        const track = result.data;
        return [{
            title: track.info.title,
            url: track.info.uri,
            source: 'youtube',
            lavalinkTrack: track.encoded
        }];
    }

    if (result.loadType === 'playlist') {
        const tracks = result.data.tracks || [];
        return tracks.map(track => ({
            title: track.info.title,
            url: track.info.uri,
            source: 'youtube',
            lavalinkTrack: track.encoded
        }));
    }

    if (result.loadType === 'search') {
        const track = result.data[0];
        return [{
            title: track.info.title,
            url: track.info.uri,
            source: 'youtube',
            lavalinkTrack: track.encoded
        }];
    }

    throw new Error('Unsupported search result loadType.');
}

// Helper to send a message that deletes itself after a delay to prevent spam
function sendTempResponse(channel, content, delay = 10000) {
    if (!channel) return;
    channel.send(content)
        .then(msg => {
            setTimeout(() => {
                msg.delete().catch(() => { });
            }, delay);
        })
        .catch(console.error);
}

// Helper to spawn yt-dlp.exe and return its stdout stream
function getYoutubeStream(videoUrl) {
    const ytdlpPath = process.platform === 'android' ? 'yt-dlp' : path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

    // Automatically make yt-dlp binary executable on non-Windows platforms (e.g. Linux VPS/Docker)
    if (process.platform !== 'win32' && process.platform !== 'android') {
        try {
            if (fs.existsSync(ytdlpPath)) {
                fs.chmodSync(ytdlpPath, '755');
            }
        } catch (chmodErr) {
            console.warn(`[Warning] Could not set execute permission on yt-dlp binary: ${chmodErr.message}`);
        }
    }

    const args = [
        '--no-progress',
        '-f', 'bestaudio',
        '-o', '-',
        '--js-runtimes', 'node',
        '--remote-components', 'ejs:github',
    ];

    if (config.youtube_cookies_from_browser) {
        args.push('--cookies-from-browser', config.youtube_cookies_from_browser);
    } else {
        const cookiePath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiePath)) {
            args.push('--cookies', cookiePath);
        }
    }

    args.push(videoUrl);

    const child = spawn(ytdlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (!msg.includes('No supported JavaScript runtime')) {
            console.warn(`[yt-dlp stderr] ${msg}`);
        }
    });

    child.on('error', (err) => {
        console.error(`[yt-dlp error] ${err.message}`);
    });

    return child;
}

// Play song helper
async function playSong(textChannel) {
    if (queue.length === 0) {
        if (isAutoplay || is247) {
            playAutoplaySong(textChannel);
            return;
        }
        if (textChannel) {
            sendTempResponse(textChannel, '🎶 **Queue is empty. Bot will stay in the voice channel.**', 8000);
        }
        return;
    }

    const song = queue[0];

    // Spotify resolution dynamic logic
    if (song.source === 'spotify' && !song.lavalinkTrack) {
        if (textChannel) {
            sendTempResponse(textChannel, `🔍 **Searching YouTube for Spotify track:** \`${song.title}\`...`, 5000);
        }

        try {
            const node = shoukaku.options.nodeResolver(shoukaku.nodes);
            if (!node) throw new Error('No active Lavalink node.');

            const searchKeyword = song.searchKeyword || song.title;
            const result = await node.rest.resolve(`ytsearch:${searchKeyword}`);

            if (result.loadType === 'search' && result.data.length > 0) {
                const track = result.data[0];
                song.lavalinkTrack = track.encoded;
                song.url = track.info.uri;
            } else {
                const scResult = await node.rest.resolve(`scsearch:${searchKeyword}`);
                if (scResult.loadType === 'search' && scResult.data.length > 0) {
                    const track = scResult.data[0];
                    song.lavalinkTrack = track.encoded;
                    song.url = track.info.uri;
                } else {
                    throw new Error('Not found on YouTube or SoundCloud.');
                }
            }
        } catch (err) {
            console.error(`Dynamic Spotify resolution failed for ${song.title}:`, err.message);
            if (textChannel) {
                sendTempResponse(textChannel, `❌ **Failed to resolve Spotify track:** \`${song.title}\``, 8000);
            }
            queue.shift();
            playSong(textChannel);
            return;
        }
    }

    // Now play the resolved track on the player
    try {
        if (!shoukakuPlayer) {
            const voiceChannel = await getTargetVoiceChannel();
            if (!voiceChannel) {
                if (textChannel) {
                    sendTempResponse(textChannel, '❌ **You must be in a voice channel or an owner must be in a voice channel!**', 8000);
                }
                queue = [];
                return;
            }
            await connectToVoiceChannel(voiceChannel);
        }

        if (textChannel) {
            sendTempResponse(textChannel, `🎶 **Now playing:** \`${song.title}\``, 10000);
        }

        if (shoukakuPlayer) {
            await shoukakuPlayer.playTrack({ track: { encoded: song.lavalinkTrack } });
            await shoukakuPlayer.setGlobalVolume(Math.round(currentVolume * 100));
        }
    } catch (err) {
        console.error(`Lavalink playTrack error:`, err);
        if (textChannel) {
            sendTempResponse(textChannel, `❌ **Failed to stream song:** ${err.message}`, 8000);
        }
        queue.shift();
        playSong(textChannel);
    }
}

// Helper to send response (edit if own message, otherwise send new message) and auto-delete after a delay
async function sendResponse(originalMsg, content, deleteDelay = 15000) {
    let responseMsg = null;
    if (originalMsg.author.id === client.user.id) {
        try {
            responseMsg = await originalMsg.edit(content);
        } catch (err) {
            responseMsg = await originalMsg.channel.send(content).catch(console.error);
        }
    } else {
        responseMsg = await originalMsg.channel.send(content).catch(console.error);
    }

    // Auto-delete response after delay
    if (responseMsg && deleteDelay) {
        setTimeout(() => {
            responseMsg.delete().catch(() => { });
        }, deleteDelay);
    }

    // Also delete the trigger message to prevent channel spam
    if (originalMsg && originalMsg.deletable) {
        setTimeout(() => {
            originalMsg.delete().catch(() => { });
        }, 3000);
    }

    return responseMsg;
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    const botId = client.user?.id;
    if (!botId) return;

    // Handle bot being disconnected or moved by a moderator/server
    if (oldState.id === botId) {
        if (oldState.channelId && !newState.channelId) {
            console.log(`[Voice State] Bot was disconnected from channel in guild: ${oldState.guild.name}`);
            cleanupPlayerState();
        }
        return;
    }

    // Find if the bot is in a voice channel in this guild
    const botVoiceState = oldState.guild.voiceStates.cache.get(botId);
    if (!botVoiceState || !botVoiceState.channelId) return;

    const botChannelId = botVoiceState.channelId;

    // Check if a member left the bot's voice channel
    /* 
    if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
        const channel = oldState.guild.channels.cache.get(botChannelId);
        if (channel) {
            // Check members in the channel (excluding bots and the bot's own selfbot user account)
            const humanMembers = channel.members.filter(m => !m.user.bot && m.id !== botId);
            if (humanMembers.size === 0) {
                console.log(`[Voice State] Voice channel "${channel.name}" in guild "${oldState.guild.name}" has no more human users. Leaving channel...`);
                cleanupPlayerState();
                await shoukaku.leaveVoiceChannel(oldState.guild.id).catch(() => {});
            }
        }
    }
    */
});

client.on('ready', () => {
    console.log('\n\x1b[36m==================================================\x1b[0m');
    console.log(`\x1b[32m[Success] logged in as: ${client.user.tag}\x1b[0m`);
    console.log(`\x1b[35m[Info] ID: ${client.user.id}\x1b[0m`);
    console.log(`\x1b[33m[Info] Prefix set to: ${prefix}\x1b[0m`);
    console.log('\x1b[36m==================================================\n\x1b[0m');

    startConsoleListener();
});

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(prefix)) return;

    // Log the command attempt to terminal for easy user ID tracking
    console.log(`\n\x1b[35m[Command Attempt]\x1b[0m from: ${message.author.tag} (ID: ${message.author.id}) - Content: "${message.content}"`);

    const allowedUsers = [client.user.id, ...(config.owner_ids || [])];
    if (!allowedUsers.includes(message.author.id)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Help Command
    if (command === 'help') {
        const helpMessage =
            `**🎸 Ukulele Self-Bot Commands:**
• \`${prefix}help\` - Shows this help menu.
• \`${prefix}ping\` - Checks the bot API latency.
• \`${prefix}status <playing|streaming|listening|watching|clear> <text>\` - Sets your status.
• \`${prefix}embed <title> | <description>\` - Sends a stylized blockquote message.
• \`${prefix}purge <count>\` - Deletes your last N messages in this channel.
• \`${prefix}info\` - Displays self-bot info.
• \`${prefix}play <song title|URL>\` - Plays a song or playlist from YouTube/Spotify.
• \`${prefix}skip\` - Skips the current song.
• \`${prefix}stop\` - Stops music, clears queue, and leaves voice channel.
• \`${prefix}pause\` - Pauses music.
• \`${prefix}resume\` - Resumes paused music.
• \`${prefix}queue\` - Shows the current playback queue.
• \`${prefix}loop [off|queue|song|playlist]\` - Toggle loop status or set specific mode.
• \`${prefix}shuffle\` - Shuffles upcoming tracks in the queue.
• \`${prefix}volume [0-200]\` - View or set volume level (default 100).
• \`${prefix}247\` - Toggle 24/7 Voice Channel & Autoplay mode.
• \`${prefix}autoplay\` or \`${prefix}random\` - Toggle random music autoplay mode.`;

        await sendResponse(message, helpMessage);
    }

    // Ping Command
    if (command === 'ping') {
        const start = Date.now();
        const resMsg = await sendResponse(message, '🏓 Pinging...');
        const latency = Date.now() - start;
        const pongText = `🏓 **Pong!**\n• Edit Latency: \`${latency}ms\`\n• API Latency: \`${Math.round(client.ws.ping)}ms\``;
        if (resMsg && resMsg.editable) {
            await resMsg.edit(pongText).catch(console.error);
        } else {
            await message.channel.send(pongText).catch(console.error);
        }
    }

    // Status Command
    if (command === 'status') {
        const type = args.shift()?.toLowerCase();
        const text = args.join(' ');

        if (!type || (type !== 'clear' && !text)) {
            return sendResponse(message, `❌ **Usage:** \`${prefix}status <playing|streaming|listening|watching|clear> [text]\``);
        }

        try {
            if (type === 'clear') {
                client.user.setPresence({ activities: [] });
                await sendResponse(message, '✅ **Status cleared!**');
            } else {
                let activityType;
                let extraOpts = {};

                if (type === 'playing') activityType = 'PLAYING';
                else if (type === 'streaming') {
                    activityType = 'STREAMING';
                    extraOpts.url = 'https://www.twitch.tv/nocopyrightsounds';
                }
                else if (type === 'listening') activityType = 'LISTENING';
                else if (type === 'watching') activityType = 'WATCHING';

                client.user.setPresence({
                    activities: [{
                        name: text,
                        type: activityType,
                        ...extraOpts
                    }]
                });

                await sendResponse(message, `✅ **Status updated to:** \`${type.toUpperCase()}: ${text}\``);
            }
        } catch (error) {
            console.error(error);
            await sendResponse(message, `❌ **Failed to update status:** ${error.message}`);
        }
    }

    // Embed/Stylized Command
    if (command === 'embed') {
        const text = args.join(' ');
        if (!text) {
            return sendResponse(message, `❌ **Usage:** \`${prefix}embed <title> | <description>\``);
        }

        const parts = text.split('|');
        const title = parts[0]?.trim();
        const desc = parts[1]?.trim() || '';

        const embedStyle =
            `>>> ╭━━━ **${title}** ━━━╮
${desc}
╰━━━━━━━━━━━━━━━━━╯`;
        await sendResponse(message, embedStyle);
    }

    // Purge Command
    if (command === 'purge') {
        const count = parseInt(args[0]);

        if (isNaN(count) || count <= 0) {
            return sendResponse(message, `❌ **Usage:** \`${prefix}purge <number_of_messages>\``);
        }

        await message.delete().catch(() => { }); // Delete the command message itself first

        const messages = await message.channel.messages.fetch({ limit: 100 });
        const userMessages = messages.filter(m => m.author.id === client.user.id).first(count);

        for (const msg of userMessages) {
            try {
                await msg.delete();
                await new Promise(resolve => setTimeout(resolve, 800));
            } catch (err) {
                console.error(`Failed to delete message: ${err.message}`);
            }
        }
    }

    // Info Command
    if (command === 'info') {
        const infoMsg =
            `🤖 **AminMusic Player Version 1.0.0**
• **Developer:** Customized for you
• **Library:** \`discord.js-selfbot-v13\`
• **Runtime:** \`Node.js ${process.version}\`
• **Guilds:** \`${client.guilds.cache.size}\`
• **Uptime:** \`${Math.round(client.uptime / 60000)} minutes\``;
        await sendResponse(message, infoMsg);
    }

    // Play Command
    if (command === 'play') {
        const query = args.join(' ');
        if (!query) {
            return sendResponse(message, `❌ **Usage:** \`${prefix}play <song title|YouTube Link|Spotify Link>\``);
        }

        const voiceChannel = await getTargetVoiceChannel(message);
        if (!voiceChannel) {
            return sendResponse(message, '❌ **You must be in a voice channel or an owner must be in a voice channel to play music!**');
        }

        const searchStatusMsg = await sendResponse(message, `🔍 **Searching:** \`${query}\`...`);

        try {
            const songs = await resolveSong(query);
            const wasPlaying = queue.length > 0;
            const channelChanged = shoukakuPlayer && shoukakuPlayer.channelId !== voiceChannel.id;

            await connectToVoiceChannel(voiceChannel);

            queue.push(...songs);

            if (queue.length === songs.length || (channelChanged && wasPlaying)) {
                if (searchStatusMsg && searchStatusMsg.deletable) {
                    await searchStatusMsg.delete().catch(() => { });
                }
                playSong(message.channel);
            } else {
                const addedMsg = songs.length > 1
                    ? `📝 **Added playlist:** \`${songs.length}\` songs added to queue.`
                    : `📝 **Added to queue:** \`${songs[0].title}\` (Position: \`${queue.length - 1}\`)`;
                if (searchStatusMsg && searchStatusMsg.editable) {
                    await searchStatusMsg.edit(addedMsg).catch(console.error);
                } else {
                    await message.channel.send(addedMsg).catch(console.error);
                }
            }
        } catch (error) {
            console.error(error);
            if (searchStatusMsg && searchStatusMsg.editable) {
                await searchStatusMsg.edit(`❌ **Error:** ${error.message}`).catch(console.error);
            } else {
                await message.channel.send(`❌ **Error:** ${error.message}`).catch(console.error);
            }
        }
    }

    // Skip Command
    if (command === 'skip') {
        if (!shoukakuPlayer) {
            return sendResponse(message, '❌ **No music is currently playing!**');
        }
        await sendResponse(message, '⏭️ **Skipping current song...**');
        await shoukakuPlayer.stopTrack();
    }


    // Stop / Leave Command
    if (command === 'stop' || command === 'leave') {
        const voiceState = message.guild?.voiceStates.cache.get(client.user.id);
        const isInVC = voiceState && voiceState.channelId;

        if (!shoukakuPlayer && !isInVC) {
            return sendResponse(message, '❌ **Bot is not in a voice channel!**');
        }
        await sendResponse(message, '🛑 **Stopping music and leaving voice channel...**');
        const guildId = message.guild.id;
        cleanupPlayerState();
        await shoukaku.leaveVoiceChannel(guildId).catch(() => { });
    }

    // Pause Command
    if (command === 'pause') {
        if (!shoukakuPlayer || shoukakuPlayer.paused) {
            return sendResponse(message, '❌ **Music is already paused or not playing!**');
        }
        await shoukakuPlayer.setPaused(true);
        await sendResponse(message, '⏸️ **Music paused.**');
    }

    // Resume Command
    if (command === 'resume') {
        if (!shoukakuPlayer || !shoukakuPlayer.paused) {
            return sendResponse(message, '❌ **Music is not paused!**');
        }
        await shoukakuPlayer.setPaused(false);
        await sendResponse(message, '▶️ **Music resumed.**');
    }

    // Queue Command
    if (command === 'queue') {
        if (queue.length === 0) {
            return sendResponse(message, '🎶 **The queue is currently empty.**');
        }

        let queueMsg = `🎶 **Current Play Queue:**\n`;
        queueMsg += `• **Now Playing:** \`${queue[0].title}\`\n\n`;

        if (queue.length > 1) {
            queueMsg += `**Up Next:**\n`;
            for (let i = 1; i < queue.length; i++) {
                queueMsg += `**${i}.** \`${queue[i].title}\`\n`;
                if (i >= 10) {
                    queueMsg += `...and ${queue.length - 11} more songs in queue.`;
                    break;
                }
            }
        }

        await sendResponse(message, queueMsg);
    }

    // Loop Command
    if (command === 'loop') {
        const mode = args[0]?.toLowerCase();

        if (!mode) {
            if (loopStatus === 'none') loopStatus = 'queue';
            else if (loopStatus === 'queue') loopStatus = 'song';
            else loopStatus = 'none';
        } else if (['off', 'none', 'clear'].includes(mode)) {
            loopStatus = 'none';
        } else if (['queue', 'all'].includes(mode)) {
            loopStatus = 'queue';
        } else if (['song', 'track', 'one'].includes(mode)) {
            loopStatus = 'song';
        } else {
            return sendResponse(message, `❌ **Invalid mode!** Usage: \`${prefix}loop <off|queue|song>\``);
        }

        const statusMap = {
            'none': 'Disabled (Normal playback)',
            'queue': 'Repeat entire queue (Queue Loop)',
            'song': 'Repeat current track (Song Loop)'
        };

        const loopEmbed =
            `>>> ╭━━━ **Loop Mode Updated** ━━━╮
🔁 **Status:** \`${statusMap[loopStatus]}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        await sendResponse(message, loopEmbed);
    }

    // Shuffle Command
    if (command === 'shuffle') {
        if (queue.length <= 2) {
            return sendResponse(message, '❌ **Not enough songs in the queue to shuffle!**');
        }

        const nowPlaying = queue[0];
        const toShuffle = queue.slice(1);

        for (let i = toShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
        }

        queue = [nowPlaying, ...toShuffle];

        const shuffleEmbed =
            `>>> ╭━━━ **Queue Shuffled** ━━━╮
🔀 Shuffled \`${toShuffle.length}\` upcoming songs!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        await sendResponse(message, shuffleEmbed);
    }

    // Volume Command
    if (command === 'volume' || command === 'vol' || command === 'v') {
        const val = args[0];
        if (!val) {
            return sendResponse(message, `🔊 **Current Volume:** \`${Math.round(currentVolume * 100)}%\``);
        }
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 200) {
            return sendResponse(message, `❌ **Invalid volume!** Specify a number between \`0\` and \`200\`.`);
        }
        currentVolume = parsed / 100;
        if (shoukakuPlayer) {
            await shoukakuPlayer.setGlobalVolume(parsed);
        }
        await sendResponse(message, `🔊 **Volume updated to:** \`${parsed}%\``);
    }

    // 24/7 Mode Command
    if (command === '247' || command === '24/7' || command === 'twentyfour') {
        const subMode = args[0]?.toLowerCase();
        if (subMode === 'playlist' || subMode === 'queue') {
            loopStatus = 'queue';
            is247 = true;
            await sendResponse(message, '♾️ **24/7 Playlist Mode Activated!** The current playlist will repeat continuously 24/7.');
        } else {
            is247 = !is247;
            if (is247) {
                isAutoplay = true;
                if (queue.length === 0) playAutoplaySong(message.channel);
                await sendResponse(message, '♾️ **24/7 Mode Activated!** Bot will remain in VC and play continuous music automatically.');
            } else {
                isAutoplay = false;
                await sendResponse(message, '🛑 **24/7 Mode Deactivated.**');
            }
        }
    }

    // Autoplay / Random Music Command
    if (command === 'autoplay' || command === 'random' || command === 'auto') {
        isAutoplay = !isAutoplay;
        if (isAutoplay) {
            await sendResponse(message, '🎲 **Random Autoplay Mode Enabled!** Bot will pick random songs when queue is empty.');
            if (queue.length === 0) {
                playAutoplaySong(message.channel);
            }
        } else {
            await sendResponse(message, '🛑 **Random Autoplay Mode Disabled.**');
        }
    }
});

const readline = require('readline');

function startConsoleListener() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'SelfBot-Console> '
    });

    // Make sure we prompt cleanly after initial startup logs
    setTimeout(() => {
        rl.prompt();
    }, 1000);

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        const args = input.split(/ +/);
        const command = args.shift().toLowerCase();
        const query = args.join(' ');

        if (command === 'help') {
            console.log('\n\x1b[36m--- Console Commands --- \x1b[0m');
            console.log('• join <channel_id>      - Connect bot to voice channel');
            console.log('• play <search or url>   - Play a song (must be in VC first)');
            console.log('• skip                   - Skip the current song');
            console.log('• stop                   - Stop playing and disconnect');
            console.log('• pause                  - Pause music');
            console.log('• resume                 - Resume music');
            console.log('• queue                  - View current queue');
            console.log('• loop <off|queue|song>  - Toggle/set loop status');
            console.log('• shuffle                - Shuffle the queue');
            console.log('• volume [0-200]         - View or set volume level');
            console.log('• help                   - Show this menu\n');
        }
        else if (command === 'join') {
            if (!query) {
                console.log('\x1b[31m[Console Error] Usage: join <channel_id>\x1b[0m');
            } else {
                await joinConsoleVC(query);
            }
        }
        else if (command === 'play') {
            if (!query) {
                console.log('\x1b[31m[Console Error] Usage: play <song name or url>\x1b[0m');
            } else {
                let targetVc = await getTargetVoiceChannel(null);
                if (!targetVc && shoukakuPlayer) {
                    targetVc = client.channels.cache.get(shoukakuPlayer.channelId);
                }

                if (!targetVc) {
                    console.log('\x1b[31m[Console Error] Bot is not in a voice channel and no owner is in a voice channel. Use "join <channel_id>" first.\x1b[0m');
                    rl.prompt();
                    return;
                }

                const wasPlaying = queue.length > 0;
                const channelChanged = shoukakuPlayer && shoukakuPlayer.channelId !== targetVc.id;

                await connectToVoiceChannel(targetVc);
                if (channelChanged) {
                    console.log(`\x1b[32m[Console Success] Reconnected/Moved to Voice Channel: "${targetVc.name}"\x1b[0m`);
                }

                console.log(`\x1b[36m[Console Info] Searching for "${query}"...\x1b[0m`);
                try {
                    const songs = await resolveSong(query);
                    queue.push(...songs);
                    if (songs.length > 1) {
                        console.log(`\x1b[32m[Console Success] Resolved and queued playlist: ${songs.length} songs added.\x1b[0m`);
                    } else {
                        console.log(`\x1b[32m[Console Success] Resolved and queued: ${songs[0].title}\x1b[0m`);
                    }
                    if (queue.length === songs.length || (channelChanged && wasPlaying)) {
                        playSong(null);
                    }
                } catch (err) {
                    console.log(`\x1b[31m[Console Error] Play failed: ${err.message}\x1b[0m`);
                }
            }
        }
        else if (command === 'skip') {
            if (!shoukakuPlayer) {
                console.log('\x1b[31m[Console Error] No music is playing!\x1b[0m');
            } else {
                console.log('⏭️ Skipping current song...');
                await shoukakuPlayer.stopTrack();
            }
        }
        else if (command === 'stop' || command === 'leave') {
            let connectedGuildId = shoukakuPlayer?.guildId;
            if (!connectedGuildId) {
                for (const guild of client.guilds.cache.values()) {
                    const voiceState = guild.voiceStates.cache.get(client.user.id);
                    if (voiceState && voiceState.channelId) {
                        connectedGuildId = guild.id;
                        break;
                    }
                }
            }

            if (!connectedGuildId) {
                console.log('\x1b[31m[Console Error] Bot is not in a voice channel!\x1b[0m');
            } else {
                console.log('🛑 Stopping music and leaving voice channel...');
                cleanupPlayerState();
                await shoukaku.leaveVoiceChannel(connectedGuildId).catch(() => { });
            }
        }
        else if (command === 'pause') {
            if (!shoukakuPlayer || shoukakuPlayer.paused) {
                console.log('\x1b[31m[Console Error] Music is already paused or not playing!\x1b[0m');
            } else {
                await shoukakuPlayer.setPaused(true);
                console.log('⏸️ Music paused.');
            }
        }
        else if (command === 'resume') {
            if (!shoukakuPlayer || !shoukakuPlayer.paused) {
                console.log('\x1b[31m[Console Error] Music is not paused!\x1b[0m');
            } else {
                await shoukakuPlayer.setPaused(false);
                console.log('▶️ Music resumed.');
            }
        }
        else if (command === 'queue') {
            if (queue.length === 0) {
                console.log('🎶 The queue is empty.');
            } else {
                console.log(`\n🎶 **Current Play Queue:**`);
                console.log(`• Now Playing: ${queue[0].title}`);
                if (queue.length > 1) {
                    console.log('Up Next:');
                    for (let i = 1; i < queue.length; i++) {
                        console.log(`  ${i}. ${queue[i].title}`);
                        if (i >= 10) {
                            console.log(`  ...and ${queue.length - 11} more`);
                            break;
                        }
                    }
                }
                console.log('');
            }
        }
        else if (command === 'loop') {
            const mode = query.toLowerCase();
            if (!mode) {
                if (loopStatus === 'none') loopStatus = 'queue';
                else if (loopStatus === 'queue') loopStatus = 'song';
                else loopStatus = 'none';
            } else if (['off', 'none', 'clear'].includes(mode)) {
                loopStatus = 'none';
            } else if (['queue', 'all'].includes(mode)) {
                loopStatus = 'queue';
            } else if (['song', 'track', 'one'].includes(mode)) {
                loopStatus = 'song';
            } else {
                console.log('\x1b[31m[Console Error] Invalid mode! Usage: loop <off|queue|song>\x1b[0m');
                rl.prompt();
                return;
            }

            const statusMap = {
                'none': 'Disabled (Normal playback)',
                'queue': 'Repeat entire queue (Queue Loop)',
                'song': 'Repeat current track (Song Loop)'
            };
            console.log(`\x1b[32m[Console Success] Loop mode updated to: "${statusMap[loopStatus]}"\x1b[0m`);
        }
        else if (command === 'shuffle') {
            if (queue.length <= 2) {
                console.log('\x1b[31m[Console Error] Not enough songs in the queue to shuffle!\x1b[0m');
            } else {
                const nowPlaying = queue[0];
                const toShuffle = queue.slice(1);
                for (let i = toShuffle.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
                }
                queue = [nowPlaying, ...toShuffle];
                console.log(`\x1b[32m[Console Success] Shuffled ${toShuffle.length} upcoming songs!\x1b[0m`);
            }
        }
        else if (command === 'volume' || command === 'vol') {
            const val = query.trim();
            if (!val) {
                console.log(`🔊 Current Volume: ${Math.round(currentVolume * 100)}%`);
            } else {
                const parsed = parseInt(val, 10);
                if (isNaN(parsed) || parsed < 0 || parsed > 200) {
                    console.log('\x1b[31m[Console Error] Invalid volume! Specify a number between 0 and 200\x1b[0m');
                } else {
                    currentVolume = parsed / 100;
                    if (shoukakuPlayer) {
                        await shoukakuPlayer.setGlobalVolume(parsed);
                    }
                    console.log(`\x1b[32m[Console Success] Volume updated to: ${parsed}%\x1b[0m`);
                }
            }
        }
        else {
            console.log(`\x1b[33mUnknown command: "${command}". Type "help" for a list of commands.\x1b[0m`);
        }

        rl.prompt();
    });
}

async function joinConsoleVC(channelId) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.error(`\x1b[31m[Console Error] Voice channel "${channelId}" not found or inaccessible.\x1b[0m`);
            return;
        }
        if (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE_VOICE') {
            console.error(`\x1b[31m[Console Error] Channel is not a voice channel (Type: ${channel.type}).\x1b[0m`);
            return;
        }

        await connectToVoiceChannel(channel);
        console.log(`\x1b[32m[Console Success] Connected to VC: "${channel.name}" in Guild: "${channel.guild.name}"\x1b[0m`);
    } catch (err) {
        console.error(`\x1b[31m[Console Error] Failed to join voice channel: ${err.message}\x1b[0m`);
    }
}

// Express server for Web Dashboard control panel
const express = require('express');
const webApp = express();
const webPort = config.web_port || config.port || process.env.PORT || process.env.SERVER_PORT || 3000;

webApp.use(express.json());

// Setup redirection middleware: if token is not configured or not logged in, redirect to settings page
webApp.get('/', (req, res, next) => {
    const isConfigured = config.token && config.token !== 'YOUR_DISCORD_USER_TOKEN';
    if (!isConfigured || !client.user) {
        return res.redirect('/settings.html');
    }
    next();
});

webApp.use(express.static(path.join(__dirname, 'public')));

// Get config status API
webApp.get('/api/config-status', (req, res) => {
    res.json({
        hasToken: !!(config.token && config.token !== 'YOUR_DISCORD_USER_TOKEN'),
        loggedIn: !!client.user,
        config: {
            prefix: config.prefix || '>',
            owner_ids: config.owner_ids || [],
            web_port: config.web_port || 3000
        }
    });
});

// Post config save API
webApp.post('/api/config', async (req, res) => {
    const { token, ownerIds, prefix: newPrefix, webPort } = req.body;

    try {
        if (token) {
            config.token = token;
        }
        if (ownerIds) {
            config.owner_ids = ownerIds;
        }
        if (newPrefix) {
            config.prefix = newPrefix;
            prefix = newPrefix;
        }
        if (webPort) {
            config.web_port = webPort;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');

        if (!client.user && config.token && config.token !== 'YOUR_DISCORD_USER_TOKEN') {
            await client.login(config.token);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to apply config:', err);
        res.status(400).json({ error: `Failed to connect to Discord with token: ${err.message}` });
    }
});

// Get status API
webApp.get('/api/status', async (req, res) => {
    let channelName = connectedChannelName;
    let guildName = connectedGuildName;

    if (shoukakuPlayer) {
        const channelId = shoukakuPlayer.channelId;
        const guildId = shoukakuPlayer.guildId;

        if (!guildName || guildName === guildId) {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
                guildName = guild.name;
                connectedGuildName = guild.name;
            } else {
                guildName = guildId;
            }
        }

        if (!channelName || channelName === channelId) {
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (channel) {
                channelName = channel.name;
                connectedChannelName = channel.name;
                if (!guildName || guildName === guildId) {
                    if (channel.guild) {
                        guildName = channel.guild.name;
                        connectedGuildName = channel.guild.name;
                    }
                }
            } else {
                channelName = channelId;
            }
        }
    }
    res.json({
        connected: !!shoukakuPlayer,
        channelName,
        guildName,
        currentSong: queue[0] || null,
        queue: queue.map((song, i) => ({ title: song.title, position: i })),
        paused: shoukakuPlayer ? shoukakuPlayer.paused : false,
        playing: shoukakuPlayer ? !shoukakuPlayer.paused : false,
        loopStatus,
        is247,
        isAutoplay,
        volume: Math.round(currentVolume * 100)
    });
});

// Get owners API to resolve names for the select dropdown
webApp.get('/api/owners', async (req, res) => {
    const owners = [];
    for (const ownerId of config.owner_ids || []) {
        try {
            const user = await client.users.fetch(ownerId).catch(() => null);
            if (user) {
                owners.push({
                    id: ownerId,
                    username: user.username,
                    tag: user.tag
                });
            } else {
                owners.push({
                    id: ownerId,
                    username: `Owner (${ownerId})`,
                    tag: ownerId
                });
            }
        } catch (e) {
            owners.push({
                id: ownerId,
                username: `Owner (${ownerId})`,
                tag: ownerId
            });
        }
    }
    res.json(owners);
});

// Control API endpoints
webApp.post('/api/play', async (req, res) => {
    const { query, targetOwnerId, customVcId } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        let targetVc = null;
        if (targetOwnerId === 'custom' && customVcId) {
            const channel = await client.channels.fetch(customVcId).catch(() => null);
            if (channel && (channel.type === 'GUILD_VOICE' || channel.type === 'GUILD_STAGE_VOICE')) {
                targetVc = channel;
            } else {
                return res.status(400).json({ error: 'Invalid or inaccessible Voice Channel ID!' });
            }
        } else {
            targetVc = await getTargetVoiceChannel(null, targetOwnerId);
        }

        const wasPlaying = queue.length > 0;
        const channelChanged = shoukakuPlayer && targetVc && shoukakuPlayer.channelId !== targetVc.id;

        if (targetVc) {
            await connectToVoiceChannel(targetVc);
        } else if (!shoukakuPlayer) {
            return res.status(400).json({ error: 'No owner is currently in a voice channel. Please join one first!' });
        }

        const songs = await resolveSong(query);
        queue.push(...songs);

        if (queue.length === songs.length || (channelChanged && wasPlaying)) {
            playSong(null);
        }

        res.json({ success: true, song: songs[0], count: songs.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

webApp.post('/api/pause', async (req, res) => {
    if (!shoukakuPlayer || shoukakuPlayer.paused) {
        return res.status(400).json({ error: 'Music is already paused or not playing' });
    }
    await shoukakuPlayer.setPaused(true);
    res.json({ success: true });
});

webApp.post('/api/resume', async (req, res) => {
    if (!shoukakuPlayer || !shoukakuPlayer.paused) {
        return res.status(400).json({ error: 'Music is not paused' });
    }
    await shoukakuPlayer.setPaused(false);
    res.json({ success: true });
});

webApp.post('/api/skip', async (req, res) => {
    if (!shoukakuPlayer) {
        return res.status(400).json({ error: 'No music is currently playing' });
    }
    await shoukakuPlayer.stopTrack();
    res.json({ success: true });
});

webApp.post('/api/stop', async (req, res) => {
    let connectedGuildId = shoukakuPlayer?.guildId;
    if (!connectedGuildId) {
        for (const guild of client.guilds.cache.values()) {
            const voiceState = guild.voiceStates.cache.get(client.user.id);
            if (voiceState && voiceState.channelId) {
                connectedGuildId = guild.id;
                break;
            }
        }
    }

    if (!connectedGuildId) {
        return res.status(400).json({ error: 'Bot is not in a voice channel' });
    }

    cleanupPlayerState();
    await shoukaku.leaveVoiceChannel(connectedGuildId).catch(() => { });
    res.json({ success: true });
});

webApp.post('/api/loop', (req, res) => {
    const { mode } = req.body;
    if (!['none', 'song', 'queue'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid loop mode. Must be none, song, or queue' });
    }
    loopStatus = mode;
    console.log(`\x1b[32m[Web API] Loop mode updated to: "${loopStatus}"\x1b[0m`);
    res.json({ success: true, loopStatus });
});

webApp.post('/api/volume', async (req, res) => {
    const { volume } = req.body;
    const parsed = parseInt(volume, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 200) {
        return res.status(400).json({ error: 'Invalid volume level. Must be between 0 and 200' });
    }
    currentVolume = parsed / 100;
    if (shoukakuPlayer) {
        await shoukakuPlayer.setGlobalVolume(parsed);
    }
    console.log(`\x1b[32m[Web API] Volume updated to: ${parsed}%\x1b[0m`);
    res.json({ success: true, volume: parsed });
});

webApp.post('/api/shuffle', (req, res) => {
    if (queue.length <= 2) {
        return res.status(400).json({ error: 'Not enough songs in the queue to shuffle!' });
    }
    const nowPlaying = queue[0];
    const toShuffle = queue.slice(1);
    for (let i = toShuffle.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
    }
    queue = [nowPlaying, ...toShuffle];
    console.log(`\x1b[32m[Web API] Shuffled ${toShuffle.length} upcoming songs!\x1b[0m`);
    res.json({ success: true });
});

webApp.post('/api/247', (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled === 'boolean') {
        is247 = enabled;
    } else {
        is247 = !is247;
    }
    if (is247) {
        isAutoplay = true;
        if (queue.length === 0) playAutoplaySong();
    }
    console.log(`\x1b[32m[Web API] 24/7 Mode updated to: ${is247}\x1b[0m`);
    res.json({ success: true, is247, isAutoplay });
});

webApp.post('/api/random', (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled === 'boolean') {
        isAutoplay = enabled;
    } else {
        isAutoplay = !isAutoplay;
    }
    if (isAutoplay && queue.length === 0) {
        playAutoplaySong();
    }
    console.log(`\x1b[32m[Web API] Random Autoplay mode updated to: ${isAutoplay}\x1b[0m`);
    res.json({ success: true, isAutoplay });
});

// Reconnect: Disconnect from current VC and reconnect to owner's current VC
webApp.post('/api/reconnect', async (req, res) => {
    const { targetOwnerId, customVcId } = req.body;

    try {
        // Find where the owner currently is
        let targetVc = null;
        if (targetOwnerId === 'custom' && customVcId) {
            const channel = await client.channels.fetch(customVcId).catch(() => null);
            if (channel && (channel.type === 'GUILD_VOICE' || channel.type === 'GUILD_STAGE_VOICE')) {
                targetVc = channel;
            } else {
                return res.status(400).json({ error: 'Invalid or inaccessible Voice Channel ID!' });
            }
        } else {
            targetVc = await getTargetVoiceChannel(null, targetOwnerId);
        }

        if (!targetVc) {
            return res.status(400).json({ error: 'No owner is currently in a voice channel. Please join a VC first!' });
        }

        // If already in the same channel, no need to reconnect
        if (shoukakuPlayer && shoukakuPlayer.channelId === targetVc.id) {
            return res.json({ success: true, message: 'Already connected to this voice channel!', channelName: targetVc.name });
        }

        // Disconnect from old VC if in one
        if (shoukakuPlayer) {
            const oldGuildId = shoukakuPlayer.guildId;
            // Temporarily preserve queue and playback state
            const savedQueue = [...queue];
            const savedLoop = loopStatus;
            const savedVolume = currentVolume;

            cleanupPlayerState();
            await shoukaku.leaveVoiceChannel(oldGuildId).catch(() => { });

            // Restore state
            queue = savedQueue;
            loopStatus = savedLoop;
            currentVolume = savedVolume;
        }

        // Connect to new VC
        await connectToVoiceChannel(targetVc);

        // Set volume back
        if (shoukakuPlayer) {
            await shoukakuPlayer.setGlobalVolume(Math.round(currentVolume * 100));
        }

        // Resume playback if there was a song playing
        if (queue.length > 0 && shoukakuPlayer) {
            playSong(null);
        }

        console.log(`\x1b[32m[Web API] Reconnected to VC: "${targetVc.name}" in "${targetVc.guild.name}"\x1b[0m`);
        res.json({ success: true, channelName: targetVc.name, guildName: targetVc.guild.name });
    } catch (err) {
        console.error('[Web API] Reconnect failed:', err);
        res.status(500).json({ error: `Reconnect failed: ${err.message}` });
    }
});

// Start web server helper
function startWebServer() {
    webApp.listen(webPort, '0.0.0.0', () => {
        console.log(`\n\x1b[32m[Success] Web Dashboard control panel is running on port ${webPort}\x1b[0m\n`);
    }).on('error', (err) => {
        console.warn(`\x1b[33m[Warning] Web server failed to start on port ${webPort}: ${err.message}\x1b[0m`);
    });
}

// Start web server immediately
startWebServer();

// Log in if credentials exist
if (config.token && config.token !== 'YOUR_DISCORD_USER_TOKEN') {
    client.login(config.token).catch(err => {
        console.error('\n\x1b[31m[Error] Login failed! Check your token inside config.json or on the settings page.\x1b[0m');
        console.error(err);
    });
} else {
    console.log(`\n\x1b[33m[Info] No Discord User Token configured. Please visit the Web Dashboard at http://localhost:${webPort} to configure and start the bot.\x1b[0m\n`);
}
