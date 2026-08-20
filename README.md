# 🎸 AminMUSIC Self-Bot (Node.js)

> **Developer:** DEVELOPER DARSHON

This is a Discord Self-Bot that can be used to customize your own secondary/alternative account through various commands.

## 🚀 How to Run

### 1. Install Dependencies
Navigate to the `AminMUSIC-selfbot` folder in your terminal and install the dependencies:
```bash
npm install
```

### 2. Configure Settings
Open the `config.json` file:
```json
{
  "token": "YOUR_DISCORD_USER_TOKEN",
  "prefix": ">"
}
```
Replace `"YOUR_DISCORD_USER_TOKEN"` with your actual secondary account token (instructions on how to find the token are below).

### 3. Start the Bot
Run the following command in the terminal to start the bot:
```bash
npm start
```

---

## 🔑 How to get your Discord User Token?

> [!WARNING]
> Your Discord token is extremely confidential. Do not share it with anyone.

1. Log in to Discord in your PC's web browser.
2. Open **Developer Tools** by pressing `F12` or `Ctrl + Shift + I` on your keyboard.
3. Go to the **Application** tab (if you don't see it, click the `>>` icon to find it).
4. In the left menu under **Storage**, expand **Local Storage** and click on `https://discord.com`.
5. Search for `token` in the filter box on the right.
6. Copy the value next to the `"token"` key (without the quotes) and paste it into `config.json`.

---

## ⚙️ Command List (Commands)
Once the bot is running, you can use these commands by typing them in any of your servers or direct messages (DMs):
* `>help` - Shows the list of all commands.
* `>ping` - Checks the latency.
* `>status <playing|streaming|listening|watching|clear> <text>` - Changes your account's status. (e.g., `>status streaming Rocking coding!`)
* `>embed <title> | <description>` - Displays a message inside a beautifully styled box. (e.g., `>embed Hello | This is custom text`)
* `>purge <count>` - Deletes the last N messages sent by you.
* `>info` - Shows information about the bot.
* `>play <song title|URL>` - Joins your voice channel and plays music (supports YouTube/Spotify links or search queries).
* `>skip` - Skips the current song and plays the next one in the queue.
* `>stop` - Stops playing music, clears the queue, and leaves the voice channel.
* `>pause` - Pauses the currently playing song.
* `>resume` - Resumes the paused song.
* `>queue` - Shows the list of songs currently in the queue.

---

## 🎵 Spotify Integration (Optional)
To play Spotify links directly, you need to add your Spotify Client ID and Client Secret to the `config.json` file:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in with your Spotify account to create a new app.
2. Under the Settings of your created app, copy the **Client ID** and **Client Secret**.
3. Set your `config.json` file like this:
   ```json
   {
     "token": "YOUR_DISCORD_USER_TOKEN",
     "prefix": ">",
     "spotify_client_id": "YOUR_SPOTIFY_CLIENT_ID",
     "spotify_client_secret": "YOUR_SPOTIFY_CLIENT_SECRET"
   }
   ```
*(Note: If Spotify credentials are not set, you can still search for songs by title or paste direct YouTube links to listen to music.)*

---

## 👤 Developer

Developed & Maintained by **DEVELOPER DARSHON**.

