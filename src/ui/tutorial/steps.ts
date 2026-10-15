// The manager-career tutorial, one screen at a time. Each step opens a page
// and, where it can, highlights the part it's talking about: `target` is a CSS
// selector, usually a `data-tour` attribute on that page. A step whose target
// isn't on screen (no offers yet, say) still shows; it just highlights nothing.

export interface TutorialStep {
  route: string;
  target?: string;
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    route: '/dashboard',
    title: 'Welcome, gaffer',
    body:
      "You run the whole club: picking the team, buying and selling players, hiring staff and keeping the board happy. This tour walks through each part of the game. Use Next and Back to move through it, or Skip to leave at any time. You can restart it later from Tutorial in the menu.",
  },
  {
    route: '/dashboard',
    target: '[data-tour="board"]',
    title: 'Your Dashboard',
    body:
      "This is your home screen: the next fixture, your last result, the latest news and your key players. Keep an eye on the board objective. It's what the owners expect from you this season, and falling well short of it can cost you your job.",
  },
  {
    route: '/dashboard',
    target: '[aria-label="Play controls"]',
    title: 'Moving time forward',
    body:
      "Nothing happens until you move time on. Advance Matchday plays one round of games. To Next Match skips ahead to your next fixture. ▶ Watch Live lets you watch your next match and make changes as it happens. To Season End plays the rest of the season for you. Before the season starts these buttons move one day at a time instead.",
  },
  {
    route: '/dashboard',
    target: 'aside nav',
    title: 'Finding your way around',
    body:
      "Every screen is in the menu, grouped into Club, Market, World and Office. On a phone, tap ☰ at the top left to open it. On a computer you can also press ? to see keyboard shortcuts.",
  },
  {
    route: '/squad',
    target: '[data-tour="squad-table"]',
    title: 'Your squad',
    body:
      "Every player at the club, with his position, age, overall rating (OVR) and potential (POT), value and wage. Tap a column heading to sort. Tap a player to open his profile, where you can set his squad role, change his training, offer a new contract, or put him up for sale or loan.",
  },
  {
    route: '/tactics',
    target: '[data-tour="tactics"]',
    title: 'Tactics',
    body:
      "Pick your formation and starting eleven here, and set how attacking or defensive the team plays. Auto-fill picks the strongest side for you. You can also choose set-piece takers and save team sheets to switch between quickly.",
  },
  {
    route: '/fixtures',
    title: 'Fixtures and results',
    body:
      "Your whole season: past results and upcoming matches. Tap a played match for the full report. To play a match yourself, use ▶ Watch Live in the controls at the top. You can make substitutions and change tactics while it runs.",
  },
  {
    route: '/standings',
    title: 'The league table',
    body:
      "Where everyone stands in your league and the other competitions you're in. Compare your position with the board's target from the Dashboard.",
  },
  {
    route: '/transfers',
    target: '[data-tour="market-filters"]',
    title: 'The transfer market',
    body:
      "Every player in the world is here. Use these filters to narrow it down by position, league, age, rating, value or wage. Money boxes show a comma every three digits, so 3,000,000 and 30,000,000 are easy to tell apart.",
  },
  {
    route: '/transfers',
    target: '[data-tour="scouts"]',
    title: 'Scouts',
    body:
      "Players outside your club only show an estimated rating until you scout them. Press Scout next to a player to send one of your scouts. Each scout can assess up to 3 players at once, and better scouts report back faster and more accurately. The reports arrive in your Inbox.",
  },
  {
    route: '/transfers',
    target: '[data-tour="market-table"]',
    title: 'Making a bid',
    body:
      "Press Bid to make an offer. The selling club starts with a high asking price and comes down as you haggle, but bidding too low annoys them, and push it too far and they stop talking to you. Sometimes another club wants the same player. That's a bidding war: you have to beat their bid, and if you take too long the seller may sell to them instead. Once the fee is agreed, you agree the player's wage and contract.",
  },
  {
    route: '/transfers',
    target: '[data-tour="transfer-list"]',
    title: 'Selling players',
    body:
      "To sell a player, open his profile and press Transfer list (or Loan list). Everyone you've listed shows up here. Clubs send offers over the following days, and other clubs can top a bid that's already in. You'll see the offers here, where you can accept, reject or ask for more.",
  },
  {
    route: '/contracts',
    title: 'Contracts',
    body:
      "Players whose contracts are running out, players you have on loan, and players at other clubs you can sign on a free transfer. Renew the ones you want to keep before they run down. A player in the last year of his deal can leave for nothing.",
  },
  {
    route: '/scouting',
    title: 'Scouting reports',
    body:
      "Every player your scouts have watched, and how sure they are about him. The longer a scout watches a player, the more accurate the rating becomes.",
  },
  {
    route: '/academy',
    title: 'The academy',
    body:
      "Your youth set-up. Hire youth coaches, send scouts to find young talent around the world, and follow your youngsters in their own competitions. Each year the best of them come through to the first team, and a player you develop yourself costs nothing to sign.",
  },
  {
    route: '/club',
    title: 'Club and staff',
    body:
      "Hire and fire your backroom staff: coaches, physios and scouts. Better staff mean better training, fewer injuries and more accurate scouting. This is also where you upgrade facilities, expand the stadium, set ticket prices and choose sponsorship deals.",
  },
  {
    route: '/finances',
    title: 'Finances',
    body:
      "Money in and money out: wages, transfer fees, ticket sales and sponsorship. Spend more than you earn for too long and the board will step in, and breaking financial fair play rules can get you banned from signing players.",
  },
  {
    route: '/manager',
    title: 'You, the manager',
    body:
      "Your reputation, what the board thinks of you, and job offers from other clubs. Do well and bigger clubs come calling. Fall short of the board's objective and you could be sacked.",
  },
  {
    route: '/inbox',
    title: 'Your inbox',
    body:
      "News comes here: scout reports, offers for your players, injuries, results and messages from the board. Check it regularly so you don't miss a bid.",
  },
  {
    route: '/dashboard',
    title: "That's the tour",
    body:
      "You're ready. Set your team on the Tactics screen, then press Advance Matchday or ▶ Watch Live to start the season. You can run through this tour again at any time from Tutorial in the menu. Good luck.",
  },
];
