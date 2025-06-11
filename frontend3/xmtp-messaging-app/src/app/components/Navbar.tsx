'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { getBasename, Basename } from './basenames';
import styles from './Navbar.module.css';

export const Navbar = () => {
  const { address, isConnected } = useAccount();
  const [basename, setBasename] = useState<Basename | null>(null);

  useEffect(() => {
    const fetchBasename = async () => {
      if (address && isConnected) {
        const name = await getBasename(address);
        if (name) {
          setBasename(name);
        }
      }
    };
    fetchBasename();
  }, [address, isConnected]);

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        <div className={styles.navContent}>
          {/* Logo and Project Name */}
          <div className={styles.logoContainer}>
            <Link href="/" className={styles.logoLink}>
              <img
                src="/assets/logo.png"
                alt="XMTP LexiPal Logo"
                className={styles.logo}
              />
              <span className={styles.projectName}>XMTP LexiPal</span>
            </Link>
          </div>

          {/* Navigation Links */}
          {/* <div className={styles.navLinks}>
            <Link
              href="/"
              className={styles.navLink}
            >
              Home
            </Link>
            <Link
              href="/learn"
              className={styles.navLink}
            >
              Messaging
            </Link>
          </div> */}

          {/* Wallet Connect Button */}
          <div className={styles.walletContainer}>
            {isConnected && basename && (
              <div className={styles.ensName}>
                {basename}
              </div>
            )}
            <ConnectButton />
          </div>
        </div>
      </div>
    </nav>
  );
}; 