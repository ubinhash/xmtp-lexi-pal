import {
  GoalCreated as GoalCreatedEvent,
  SignerUpdated as SignerUpdatedEvent,
  StakeClaimed as StakeClaimedEvent,
  VocabLearned as VocabLearnedEvent,
  VocabMastered as VocabMasteredEvent
} from "../generated/LanguageLearningGoal/LanguageLearningGoal"
import {
  GoalCreated,
  SignerUpdated,
  StakeClaimed,
  VocabLearned,
  VocabMastered
} from "../generated/schema"

export function handleGoalCreated(event: GoalCreatedEvent): void {
  let entity = new GoalCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.user = event.params.user
  entity.goalId = event.params.goalId
  entity.targetVocab = event.params.targetVocab
  entity.deadline = event.params.deadline
  entity.difficulty = event.params.difficulty

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSignerUpdated(event: SignerUpdatedEvent): void {
  let entity = new SignerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.newSigner = event.params.newSigner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleStakeClaimed(event: StakeClaimedEvent): void {
  let entity = new StakeClaimed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.user = event.params.user
  entity.goalId = event.params.goalId
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleVocabLearned(event: VocabLearnedEvent): void {
  let entity = new VocabLearned(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.user = event.params.user
  entity.goalId = event.params.goalId
  entity.word = event.params.word
  entity.progress = event.params.progress

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleVocabMastered(event: VocabMasteredEvent): void {
  let entity = new VocabMastered(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.user = event.params.user
  entity.goalId = event.params.goalId
  entity.word = event.params.word

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
