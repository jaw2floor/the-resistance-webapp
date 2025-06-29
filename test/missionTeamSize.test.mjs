import { missionTeamSize } from '../public/js/utils.mjs';
import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('missionTeamSize', () => {
  it('returns correct team sizes for 5 players', () => {
    assert.strictEqual(missionTeamSize(5, 1), 2);
    assert.strictEqual(missionTeamSize(5, 2), 3);
    assert.strictEqual(missionTeamSize(5, 3), 2);
    assert.strictEqual(missionTeamSize(5, 4), 3);
    assert.strictEqual(missionTeamSize(5, 5), 3);
  });

  it('returns correct team size for 10 players mission 2', () => {
    assert.strictEqual(missionTeamSize(10, 2), 4);
  });
});
