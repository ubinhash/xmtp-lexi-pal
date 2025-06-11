import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  GoalCreated,
  SignerUpdated,
  StakeClaimed,
  VocabLearned,
  VocabMastered
} from "../generated/LanguageLearningGoal/LanguageLearningGoal"

export function createGoalCreatedEvent(
  user: Address,
  goalId: BigInt,
  targetVocab: BigInt,
  deadline: BigInt,
  difficulty: i32
): GoalCreated {
  let goalCreatedEvent = changetype<GoalCreated>(newMockEvent())

  goalCreatedEvent.parameters = new Array()

  goalCreatedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  goalCreatedEvent.parameters.push(
    new ethereum.EventParam("goalId", ethereum.Value.fromUnsignedBigInt(goalId))
  )
  goalCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "targetVocab",
      ethereum.Value.fromUnsignedBigInt(targetVocab)
    )
  )
  goalCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "deadline",
      ethereum.Value.fromUnsignedBigInt(deadline)
    )
  )
  goalCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "difficulty",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(difficulty))
    )
  )

  return goalCreatedEvent
}

export function createSignerUpdatedEvent(newSigner: Address): SignerUpdated {
  let signerUpdatedEvent = changetype<SignerUpdated>(newMockEvent())

  signerUpdatedEvent.parameters = new Array()

  signerUpdatedEvent.parameters.push(
    new ethereum.EventParam("newSigner", ethereum.Value.fromAddress(newSigner))
  )

  return signerUpdatedEvent
}

export function createStakeClaimedEvent(
  user: Address,
  goalId: BigInt,
  amount: BigInt
): StakeClaimed {
  let stakeClaimedEvent = changetype<StakeClaimed>(newMockEvent())

  stakeClaimedEvent.parameters = new Array()

  stakeClaimedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  stakeClaimedEvent.parameters.push(
    new ethereum.EventParam("goalId", ethereum.Value.fromUnsignedBigInt(goalId))
  )
  stakeClaimedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return stakeClaimedEvent
}

export function createVocabLearnedEvent(
  user: Address,
  goalId: BigInt,
  word: string,
  progress: i32
): VocabLearned {
  let vocabLearnedEvent = changetype<VocabLearned>(newMockEvent())

  vocabLearnedEvent.parameters = new Array()

  vocabLearnedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  vocabLearnedEvent.parameters.push(
    new ethereum.EventParam("goalId", ethereum.Value.fromUnsignedBigInt(goalId))
  )
  vocabLearnedEvent.parameters.push(
    new ethereum.EventParam("word", ethereum.Value.fromString(word))
  )
  vocabLearnedEvent.parameters.push(
    new ethereum.EventParam(
      "progress",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(progress))
    )
  )

  return vocabLearnedEvent
}

export function createVocabMasteredEvent(
  user: Address,
  goalId: BigInt,
  word: string
): VocabMastered {
  let vocabMasteredEvent = changetype<VocabMastered>(newMockEvent())

  vocabMasteredEvent.parameters = new Array()

  vocabMasteredEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  vocabMasteredEvent.parameters.push(
    new ethereum.EventParam("goalId", ethereum.Value.fromUnsignedBigInt(goalId))
  )
  vocabMasteredEvent.parameters.push(
    new ethereum.EventParam("word", ethereum.Value.fromString(word))
  )

  return vocabMasteredEvent
}
