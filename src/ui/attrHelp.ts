// Short, plain-language explanations of each player attribute (§ #66, in-game
// help). Keyed by the camelCase attribute name used across the attribute groups.

export const ATTR_HELP: Record<string, string> = {
  // Technical
  crossing: 'Quality of balls delivered from wide areas.',
  finishing: 'Composure and accuracy when shooting at goal.',
  headingAccuracy: 'Accuracy of headers, shooting and defending.',
  shortPassing: 'Accuracy of short, ground passes.',
  longPassing: 'Accuracy and weight of long passes.',
  volleys: 'Technique striking a moving ball out of the air.',
  dribbling: 'Close control while running with the ball.',
  curve: 'Ability to bend the ball on passes and shots.',
  fkAccuracy: 'Accuracy from direct free kicks.',
  ballControl: 'First touch and control when receiving the ball.',
  shotPower: 'Raw power behind shots.',
  longShots: 'Accuracy and threat shooting from distance.',
  penalties: 'Composure and accuracy from the penalty spot.',
  // Mental
  aggression: 'Drive to win the ball; raises tackling and card risk.',
  interceptions: 'Reading play to cut out passes.',
  positioning: 'Attacking off-ball movement to find space.',
  vision: 'Awareness to spot and pick out a pass.',
  composure: 'Calmness under pressure in key moments.',
  reactions: 'Speed of response to what happens around them.',
  standingTackle: 'Timing and cleanliness of standing tackles.',
  slidingTackle: 'Timing and cleanliness of slide tackles.',
  marking: 'Defensive awareness tracking opponents.',
  // Physical
  acceleration: 'How quickly they reach top speed.',
  sprintSpeed: 'Top running speed.',
  agility: 'Balance and nimbleness changing direction.',
  balance: 'Staying on their feet under contact.',
  jumping: 'Leap for aerial duels.',
  stamina: 'Ability to keep intensity across 90 minutes.',
  strength: 'Physical power in duels.',
  // Goalkeeping
  diving: 'Reach and agility making saves.',
  handling: 'Cleanly catching and holding shots.',
  kicking: 'Distribution range and accuracy with the feet.',
  reflexes: 'Reaction speed to point-blank shots.',
  gkPositioning: 'Positioning to narrow angles and cover the goal.',
};

/** Turn a camelCase attribute key into a spaced, human label. */
export const attrLabel = (k: string): string => k.replace(/([A-Z])/g, ' $1').replace(/^gk /, '').trim();
