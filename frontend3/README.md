# XMTP Messaging App

A Next.js application that allows users to connect their wallet and send messages to the XMTP network.

## Features

- Wallet connection using RainbowKit
- Send messages to a default recipient
- Switch between dev and production networks
- Modern UI with Tailwind CSS

## Prerequisites

- Node.js 18.17.0 or higher
- npm or yarn
- MetaMask or another Web3 wallet

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd xmtp-messaging-app
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory and add your WalletConnect project ID:
```
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

The default recipient and network settings can be modified in `src/config/xmtp.ts`:

```typescript
export const XMTP_CONFIG = {
  defaultRecipient: '0x55fdc82920507ed1694a79b19c1025e7f12efac4',
  defaultInboxId: '06f361ab883c80982ae7f4fdf518275f0e21d6cd4b3b1fe8daf2dae60f41c990',
  networks: {
    dev: {
      name: 'Dev',
      env: 'dev',
    },
    production: {
      name: 'Production',
      env: 'production',
    },
  },
};
```

## Usage

1. Connect your wallet using the RainbowKit interface
2. Select the desired network (dev or production)
3. Type your message in the text area
4. Click "Send Message" to send the message to the default recipient

## Technologies Used

- Next.js
- TypeScript
- Tailwind CSS
- XMTP.js
- wagmi
- RainbowKit
- ethers.js

## License

MIT 