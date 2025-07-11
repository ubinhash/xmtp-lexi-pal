'use client';
import React from 'react';
import { useAccount, useContractRead } from 'wagmi';
import { BigNumber, utils as ethersUtils } from 'ethers';
import GoalAbi from './GoalAbi.json';
import styles from './GoalSummary.module.css';
import { CONTRACT_ADDRESS } from '../config/contract';

function formatCountdown(deadline: string | number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(deadline) - now;
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (60 * 60 * 24));
  const hours = Math.floor((diff % (60 * 60 * 24)) / (60 * 60));
  return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''} remaining`;
}

export const GoalSummary: React.FC = () => {
  const { address } = useAccount();

  const { data: activeGoalId, isLoading: loadingId, refetch: refetchActiveGoalId } = useContractRead({
    address: CONTRACT_ADDRESS,
    abi: GoalAbi,
    functionName: 'getActiveGoalId',
    args: [address],
  });

  const hasActiveGoal = activeGoalId && BigNumber.from(activeGoalId).gt(0);

  const { data: goal, isLoading: loadingGoal, refetch: refetchGoal } = useContractRead({
    address: CONTRACT_ADDRESS,
    abi: GoalAbi,
    functionName: 'goals',
    args: hasActiveGoal ? [activeGoalId] : undefined,
  });

  const handleRefresh = () => {
    refetchActiveGoalId();
    refetchGoal();
  };

  if (!address) {
    return <div className={styles.goalSummary}>Connect your wallet</div>;
  }

  if (loadingId || (hasActiveGoal && loadingGoal)) {
    return <div className={styles.goalSummary}>Loading...</div>;
  }

  if (!hasActiveGoal) {
    return <div className={styles.goalSummary}>No Active Goal | If you are a new user, please reload after your first message</div>;
  }

  // goal struct: [user, targetVocab, stake, startTime, deadline, claimed, learnedCount, difficulty]
  const isGoalStruct = goal && Array.isArray(goal) && goal.length >= 8;
  const targetVocab = isGoalStruct ? BigNumber.from(goal[1]).toString() : '-';
  const deadline = isGoalStruct ? BigNumber.from(goal[4]).toNumber() : 0;
  const stake = isGoalStruct ? ethersUtils.formatEther(goal[2]) : '-';
  const learnedCount = isGoalStruct ? BigNumber.from(goal[6]).toString() : '-';
  const difficulty = isGoalStruct ? goal[7].toString() : '-';

  return (
    <div className={styles.goalSummary}>

    

      <span className={styles.vocab}>Goal: {learnedCount}/{targetVocab} Learned</span>
      <span className={styles.days}> {deadline ? formatCountdown(deadline) : '-'}</span>
      <span className={styles.eth}>Stake: {stake} ETH</span>
      <span className={styles.eth}>Difficulty: {difficulty}</span>
      <button
          className={styles.refreshButton}
          onClick={handleRefresh}
          title="Refresh"
          disabled={loadingId || (hasActiveGoal && loadingGoal)}
        >
          &#x21bb;
        </button>
      
    </div>
  );
}; 