# Creator Studio Keyframe-Conditioned Row Design

**Goal:** Make high-quality OpenPet action generation provider-first by sending a single stitched reference board containing the user source identity plus explicit action keyframes, then accepting only complete sprite rows that pass local QA.

## Context

The current canonical action path asks the image provider for a single action anchor and then synthesizes intermediate frames locally. That path is stable but weak for motions such as running, jumping, and waving because it cannot invent new readable poses. It also risks visible patch artifacts when the local synthesizer moves a rectangular region.

The new primary path should shift the provider request from "draw one action pose" to "complete this action row from identity plus keyframes." The user source image remains the highest identity authority. Generated keyframes are guidance only and must not replace the source identity.

## Approach

For canonical-frame actions, Creator Studio builds a keyframe conditioning board before final frame extraction. The board contains:

- The original user source reference or composite board.
- One selected provider action anchor as the peak/extreme keyframe.
- A written action contract describing start, peak, and return/end poses.
- Fixed sprite row layout instructions, including frame count, transparent background, equal cells, no labels, no copied reference board, and stable lower-center root.

The provider then generates a full sprite sheet row candidate. The existing action-frame builder extracts frames from that sheet and runs QA. If the provider row fails QA or is unavailable, the workflow fails with recorded evidence. It must not fall back to local canonical synthesis for deliverable action generation because local patch motion can cut off limbs, create holes, and hide provider quality failures.

## Quality Gates

The row candidate is accepted only if local QA proves:

- Expected frame count and frame size.
- Each frame has visible foreground and useful transparency.
- The row is not a copied reference board or model sheet.
- The pet baseline and lower-center root remain stable.
- The frames are not static.
- Motion is readable enough for the action type.

Provider candidate metadata must record the input board path, prompt path, selected model, attempts, output path, and whether row QA passed. Failed provider rows are review blockers, not importable assets.

## Out Of Scope

This design does not replace the official full-pet atlas row pipeline. It only improves single-action canonical generation and the one-click new-pet action path that uses those single-action jobs.
