export function missionTeamSize(playerCount, mission) {
  const tbl = {
    5 : [0, 2, 3, 2, 3, 3],
    6 : [0, 2, 3, 4, 3, 4],
    7 : [0, 2, 3, 3, 4, 4],
    8 : [0, 3, 4, 4, 5, 5],
    9 : [0, 3, 4, 4, 5, 5],
    10: [0, 3, 4, 4, 5, 5],
  };
  return tbl[playerCount][mission];
}
