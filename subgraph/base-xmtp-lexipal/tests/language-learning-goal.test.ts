import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { GoalCreated } from "../generated/schema"
import { GoalCreated as GoalCreatedEvent } from "../generated/LanguageLearningGoal/LanguageLearningGoal"
import { handleGoalCreated } from "../src/language-learning-goal"
import { createGoalCreatedEvent } from "./language-learning-goal-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let user = Address.fromString("0x0000000000000000000000000000000000000001")
    let goalId = BigInt.fromI32(234)
    let targetVocab = BigInt.fromI32(234)
    let deadline = BigInt.fromI32(234)
    let difficulty = 123
    let newGoalCreatedEvent = createGoalCreatedEvent(
      user,
      goalId,
      targetVocab,
      deadline,
      difficulty
    )
    handleGoalCreated(newGoalCreatedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("GoalCreated created and stored", () => {
    assert.entityCount("GoalCreated", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "GoalCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "user",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "GoalCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "goalId",
      "234"
    )
    assert.fieldEquals(
      "GoalCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "targetVocab",
      "234"
    )
    assert.fieldEquals(
      "GoalCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "deadline",
      "234"
    )
    assert.fieldEquals(
      "GoalCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "difficulty",
      "123"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
