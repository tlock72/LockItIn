# LockItIn

The family leaderboard for **Krillion**, **MapTap** and **TimeGuessr**.

Everyone plays the games on their own sites, then pastes the share text into LockItIn. The app finds the score, shows who's leading today, and keeps a separate running leaderboard for each game.

It works on phones (add it to your home screen and it opens like an app) and in any browser on a computer. It's plain HTML, CSS and JavaScript, hosted free on GitHub Pages, with scores stored in your own free Supabase project. It doesn't depend on Claude.

## What's in it

- **One-time login:** open the link, tap your name (or add yourself), done. The device remembers you. No passwords or codes. One person can be logged in on a phone and a computer at the same time.
- **Today:**
  - A card for each game with a Play link, your score and place, and who has played.
  - **Lock in my score** opens a sheet. Paste the share text and the score fills in. Confetti for a new personal best or for taking the lead.
- **Yesterday's winners:** a button that reveals who took the crown in each game yesterday.
- **Leaderboards:** one per game, for the last 7 days, 30 days or all time:
  - a podium for the top three
  - running stats: top score, family average, most wins and the hottest streak
  - a table with average, best, total, wins, games played, streak and a "form" line of each person's last 10 scores
  - a 14-day grid with daily winners crowned
- **Family:** your stats per game, your name, color and profile picture, and the whole family list. Admins also get game and people settings.

## Profile pictures

Each person has a colored circle with their initials until a picture is added. To add one, put a link to an image (it must start with `https://`) in **Family → Edit name, color or picture**. An admin can also set anyone's picture under **Family → Admin → People**.

## Setup

The Supabase project is already set up and connected in [`config.js`](config.js). To rebuild it from scratch:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It's safe to run again later.
3. Go to **Authentication → Sign In / Providers** and switch on **Allow anonymous sign-ins**.
4. Copy the **Project URL** and **anon** key from **Project Settings → API** into `config.js`.

### Put it online (GitHub Pages)

1. Push this folder to a **public** GitHub repo (GitHub Desktop: **Add Local Repository**, then **Publish repository**).
2. On github.com, go to **Settings → Pages**. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The app goes live at `https://YOUR-USERNAME.github.io/LockItIn/`. Open it first and add yourself. The first person becomes the admin. Then send the link to the family.

### Install

- **iPhone:** open the link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open it in Chrome, tap **⋮**, then **Install app**.
- **Computer:** bookmark it, or use the install icon in Chrome or Edge's address bar.

## Notes

- Anyone who has the link can add themselves, so share it only with family.
- **Score reading:** `parseShare()` in [`app.js`](app.js) reads the score from pasted text.
  - MapTap reads its "Final score" line.
  - TimeGuessr reads the "…/50,000" total.
  - Krillion reads the score line under "Krillion #…" and counts each answer's tier from the emoji: 🫧 Plankton, 🐟 Schooler, 🦑 Rare, 🏮 Deep Cut. The emoji for Blanks and One in a Krillion are learned automatically the first time they appear. Tier counts appear in **Krillion catches** on the Krillion leaderboard and on your profile.
  - If a game changes its share text, add a pattern there.
- **After changing app files:** bump `VERSION` in [`sw.js`](sw.js) so installed copies update.
- **Try it locally:** run `python3 -m http.server 8000` in this folder and open http://localhost:8000.
