'use client';

import React from 'react';
import { Messaging } from '../components/Messaging';
import { VocabProgress } from '../components/VocabProgress';
import { Navbar } from '../components/Navbar';
import { GoalSummary } from '../components/GoalSummary';
import styles from './LearnPage.module.css';

export default function LearnPage() {
  return (
    <>
      <Navbar />
      <main className={styles.mainBg}>
        <div className={styles.topRow}>
            <GoalSummary />
        </div>
        <div className={styles.flexRow}>
          <div className={styles.leftColumn}>
            <Messaging />
          </div>
          <div className={styles.rightColumn}>
            <VocabProgress />
          </div>
        </div>
      </main>
    </>
  );
} 