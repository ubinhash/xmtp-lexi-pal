'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from './components/Navbar';
import styles from './page.module.css';
import FooterStyles from './components/Footer.module.css';

export default function Home() {
  return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.hero}>
            <div className={styles.content}>
              <h1 className={styles.title}>XMTP LexiPal</h1>
              <p className={styles.subtitle}>
                A friendly AI agent that keeps you accountable when learning languages.
              </p>

              <div className={styles.punchline}>
                <p className={styles.punchlineTitle}>Set a goal. Stake ETH. Prove mastery.</p>
                <p className={styles.punchlineText}>
                  No shortcuts — your AI agent tracks your progress on-chain and determines when you've truly learned each word and triggers your stake release.
                </p>
              </div>

              <div className={styles.buttonGroup}>
                <Link href="/learn" className={styles.primaryButton}>
                  Start Learning
                </Link>
                <Link href="/quiz" className={styles.secondaryButton}>
                  Group Quiz
                </Link>
              </div>
            </div>
            <div className={styles.imageContainer}>
              <Image
                src="/assets/pal.png"
                alt="Lexi Pal"
                width={500}
                height={500}
                className={styles.image}
              />
            </div>
          </div>
        </div>
      </main>
      
      <footer className={FooterStyles.footer}>
        <div className={FooterStyles.container}>
          <div className={FooterStyles.content}>
            <span>Powered by</span>
            <a 
              href="https://xmtp.org" 
              target="_blank" 
              rel="noopener noreferrer"
              className={FooterStyles.link}
            >
              <Image 
                src="/logo/xmtp.png" 
                alt="XMTP Logo" 
                width={20} 
                height={20} 
                className={FooterStyles.logo}
              />
              XMTP
            </a>
            <span className={FooterStyles.separator}>•</span>
            <a 
              href="https://github.com/coinbase/agentkit" 
              target="_blank" 
              rel="noopener noreferrer"
              className={FooterStyles.link}
            >
              <Image 
                src="/logo/coinbase.png" 
                alt="Coinbase Logo" 
                width={20} 
                height={20} 
                className={FooterStyles.logo}
              />
              Coinbase Agent Kit
            </a>
            <span className={FooterStyles.separator}>•</span>
            <a 
              href="https://base.org" 
              target="_blank" 
              rel="noopener noreferrer"
              className={FooterStyles.link}
            >
              <Image 
                src="/logo/base.png" 
                alt="Base Logo" 
                width={20} 
                height={20} 
                className={FooterStyles.logo}
              />
              Built on Base
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
