import { missionTeamSize } from '../public/js/utils.mjs';
import assert from 'node:assert';
import { describe, it } from 'node:test';

const expected = {
  5: [0, 2, 3, 2, 3, 3],
  6: [0, 2, 3, 4, 3, 4],
  7: [0, 2, 3, 3, 4, 4],
  8: [0, 3, 4, 4, 5, 5],
  9: [0, 3, 4, 4, 5, 5],
  10: [0, 3, 4, 4, 5, 5],
};

describe('missionTeamSize', () => {
  for (const [players, missions] of Object.entries(expected)) {
    const p = Number(players);
    for (let m = 1; m <= 5; m++) {
      it(`returns ${missions[m]} for ${p} players mission ${m}`, () => {
        assert.strictEqual(missionTeamSize(p, m), missions[m]);
      });
    }
  }
});
