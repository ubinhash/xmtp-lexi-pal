import React, { useEffect, useState, useCallback } from 'react';
import styles from './VocabProgress.module.css';
import { useAccount } from 'wagmi';
import { VOCABULARY_WORDS } from './vocabulary';
import { GRAPH_API_URL } from '../config/contract';

interface VocabLearned {
  word: string;
  progress: number;
  goalId?: string;
  blockTimestamp?: string;
}

interface GoalCreated {
  goalId: string;
  targetVocab: string;
  deadline: string;
  difficulty: string;
  blockTimestamp: string;
}

const USER_ADDRESS = "0x48Dc4876472CbA3d91da6100a5B7fDeAAc062353";

export const VocabProgress: React.FC = () => {
  const { address } = useAccount();
  const userAddress = address || "";
  const [vocabList, setVocabList] = useState<VocabLearned[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalDifficulty, setGoalDifficulty] = useState<number>(5); // Default to 5

  const fetchGoalDifficulty = useCallback(async () => {
    if (!address) return;
    
    try {
      const response = await fetch(GRAPH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{
            goalCreateds(where: { user: "${address}" }, orderBy: blockTimestamp, orderDirection: desc) {
              goalId 
              targetVocab 
              deadline 
              difficulty
              blockTimestamp
            }
          }`
        })
      });
      
      const json = await response.json();
      const goals: GoalCreated[] = json.data?.goalCreateds || [];
      
      // Use the most recent goal's difficulty, or default to 5
      if (goals.length > 0) {
        const difficulty = parseInt(goals[0].difficulty);
        setGoalDifficulty(isNaN(difficulty) ? 5 : difficulty);
      }
    } catch (err) {
      console.error('Failed to fetch goal difficulty:', err);
      // Keep default difficulty
    }
  }, [address]);

  const fetchVocab = useCallback(async () => {
    if (!address) {
      setVocabList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // First, get the goal difficulty
      await fetchGoalDifficulty();
      
      const response = await fetch(GRAPH_API_URL, {
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
      
      // Get vocabulary words from the imported VOCABULARY_WORDS
      const learnedWords = new Set(deduped.map(v => v.word));
      
      // Filter by the current goal's difficulty level - only show words with difficulty <= goalDifficulty
      const filteredVocab = VOCABULARY_WORDS.filter(word => word.difficulty == goalDifficulty);
      
      // Sort by difficulty to prioritize easier words
      const sortedVocab = [...filteredVocab].sort((a, b) => a.difficulty - b.difficulty);
      const allVocabWords = sortedVocab.map(v => v.word);
      
      // Add vocab from the sorted vocabulary list not already learned
      const toAdd = allVocabWords
        .filter(word => !learnedWords.has(word))
        .slice(0, 15)
        .map(word => ({ word, progress: 0 }));
        
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
  }, [address, fetchGoalDifficulty, goalDifficulty]);

  useEffect(() => {
    fetchVocab();
  }, [fetchVocab,userAddress]);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span>Vocab Progress (Level {goalDifficulty})</span>
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