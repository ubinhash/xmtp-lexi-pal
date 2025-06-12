import React, { useEffect, useState, useCallback } from 'react';
import styles from './VocabProgress.module.css';
import { useAccount } from 'wagmi';

interface VocabLearned {
  word: string;
  progress: number;
  goalId?: string;
  blockTimestamp?: string;
}

const USER_ADDRESS = "0x48Dc4876472CbA3d91da6100a5B7fDeAAc062353";

// Static vocab list
const ALL_VOCAB: string[] = [
  'ありがとう',
  'さようなら',
  'おやすみ',
  'こんにちは',
  'すみません',
  'はい',
  'いいえ',
  'おはよう',
  'こんばんは',
  'いただきます',
  'ごちそうさま',
  'お願いします',
  'ちんざくうし',
];

export const VocabProgress: React.FC = () => {
  const { address } = useAccount();
  const userAddress = address || "";
  const [vocabList, setVocabList] = useState<VocabLearned[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVocab = useCallback(async () => {
    if (!address) {
      setVocabList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('https://api.studio.thegraph.com/query/111655/base-xmtp-lexipal/version/latest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{
            vocabLearneds(where: { user: "${address}" }, orderBy: blockTimestamp, orderDirection: desc, first: 1000) {
              word
              progress
              goalId
              blockTimestamp
            }
          }`
        })
      });
      const json = await response.json();
      let learned: VocabLearned[] = json.data.vocabLearneds || [];
      // Deduplicate: keep only the latest progress for each word
      const latestMap = new Map<string, VocabLearned>();
      for (const entry of learned) {
        if (!latestMap.has(entry.word)) {
          latestMap.set(entry.word, entry);
        }
      }
      const deduped = Array.from(latestMap.values());
      // Add up to 5 vocab from ALL_VOCAB not already learned
      const learnedWords = new Set(deduped.map(v => v.word));
      const toAdd = ALL_VOCAB.filter(word => !learnedWords.has(word)).slice(0, 5).map(word => ({ word, progress: 0 }));
      let combined = [...deduped, ...toAdd];
      // Sort by progress (desc), then alphabetically
      combined.sort((a, b) => {
        if (b.progress !== a.progress) return b.progress - a.progress;
        return a.word.localeCompare(b.word);
      });
      setVocabList(combined);
    } catch (err) {
      setError('Failed to fetch vocab progress');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchVocab();
  }, [fetchVocab,userAddress]);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span>Vocab Progress</span>
        <button
          className={styles.refreshButton}
          onClick={fetchVocab}
          title="Refresh"
          disabled={loading}
        >
          &#x21bb;
        </button>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className={styles.error}>{error}</div>}
      <ul className={styles.list}>
        {vocabList.map((item, idx) => (
          <li key={idx} className={styles.listItem}>
            <span className={styles.checkboxWrapper}>
              {item.progress === 3 ? (
                <input type="checkbox" checked readOnly className={styles.checkbox} />
              ) : item.progress === 1 || item.progress === 2 ? (
                <span className={styles.highlightBox}></span>
              ) : (
                <input type="checkbox" checked={false} readOnly className={styles.checkbox} />
              )}
            </span>
            <span className={styles.text}>{item.word}</span>
            <span className={styles.progress}>{item.progress}/3</span>
          </li>
        ))}
      </ul>
    </div>
  );
}; 