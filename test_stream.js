const play = require('play-dl');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');

// Load config
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (config.youtube_cookie) {
    let ytCookie = config.youtube_cookie;
    try {
        let cookiesArray = null;
        if (typeof ytCookie === 'string') {
            try {
                cookiesArray = JSON.parse(ytCookie);
            } catch (e) {}
        } else if (Array.isArray(ytCookie)) {
            cookiesArray = ytCookie;
        }
        if (cookiesArray && Array.isArray(cookiesArray)) {
            ytCookie = cookiesArray.map(c => `${c.name}=${c.value}`).join('; ');
        }
    } catch (e) {}

    play.setToken({
        youtube: {
            cookie: ytCookie
        }
    }).then(() => {
        console.log('YouTube cookie configured.');
        test();
    }).catch(err => {
        console.error('YouTube cookie setup failed:', err.message);
    });
} else {
    console.log('No YouTube cookie found in config.');
    test();
}

async function test() {
    try {
        const query = 'kaliyani';
        console.log('Searching for:', query);
        const ytInfo = await yts(query);
        if (ytInfo && ytInfo.videos && ytInfo.videos.length > 0) {
            const song = {
                title: ytInfo.videos[0].title,
                url: ytInfo.videos[0].url
            };
            console.log('Found video:', song.title);
            console.log('Video URL:', song.url);
            
            console.log('Attempting play.stream...');
            const stream = await play.stream(song.url);
            console.log('Success! Stream type:', stream.type);
        } else {
            console.log('No video found');
        }
    } catch (err) {
        console.error('Error occurred:', err);
    }
}
