export type NetworkType = 'dev' | 'production';

export const XMTP_CONFIG = {
  defaultRecipient: '0x55fdc82920507ed1694a79b19c1025e7f12efac4'.toLowerCase(),
  defaultInboxId: '06f361ab883c80982ae7f4fdf518275f0e21d6cd4b3b1fe8daf2dae60f41c990'.toLowerCase(),
  networks: {
    dev: {
      name: 'Development',
      env: 'dev',
    },
    production: {
      name: 'Production',
      env: 'production',
    },
  },
} as const; 