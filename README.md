# One More

Card and board games for people in the same room. Put it on the TV, scan the QR code with your phone, and play.

Early days: the first playable game is a minimal 21. See [vision.md](vision.md), [architecture.md](architecture.md), [decisions.md](decisions.md) and [tasks.md](tasks.md).

## Run it

Needs Node 24+ and pnpm.

```sh
pnpm install
pnpm dev
```

1. On the TV or laptop, open http://localhost:5550 and choose **Start a room**. Then choose **Make this the shared screen**.
2. Phones on the same Wi-Fi scan the QR code. The dev server prints the LAN address, e.g. http://10.0.0.20:5550.
3. Press **Start game** once everyone's in.

## Run it as one process

```sh
pnpm start
```

This builds the client, and the game server serves it on port 5551: http://localhost:5551, or your LAN address with port 5551. Use this for game nights; `pnpm dev` is for development.

## Test

```sh
pnpm test
pnpm typecheck
```
