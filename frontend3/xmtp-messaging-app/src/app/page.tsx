'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from './components/Navbar';
import styles from './page.module.css';

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
                  No shortcuts — your AI agent determines when you've truly learned each word and triggers your stake release on-chain.
                </p>
              </div>

              <div className={styles.buttonGroup}>
                <Link href="/learn" className={styles.primaryButton}>
                  Start Chat
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
    </>
  );
}
