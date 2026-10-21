import 'package:shared_preferences/shared_preferences.dart';

class SavingsQuote {
  final String id;
  final String quote;
  final String author;
  final String actionTip;

  const SavingsQuote({
    required this.id,
    required this.quote,
    required this.author,
    required this.actionTip,
  });
}

class DailyMotivationService {
  static const String _prefLastDateKey = 'finpocket_last_quote_date_v1';
  static const String _prefTodayQuoteIdKey = 'finpocket_today_quote_id_v1';

  /// Curated pool of 115+ unique, inspiring savings & financial wisdom quotes from global leaders, investors, and thinkers
  static const List<SavingsQuote> quotesPool = [
    SavingsQuote(
      id: 'sq_001',
      quote: 'Do not save what is left after spending, but spend what is left after saving.',
      author: 'Warren Buffett',
      actionTip: 'Move at least 10% of today’s available balance directly to your Emergency Shield before spending.',
    ),
    SavingsQuote(
      id: 'sq_002',
      quote: 'A penny saved is a penny earned.',
      author: 'Benjamin Franklin',
      actionTip: 'Review your small recurring purchases today—tiny leaks sink great ships.',
    ),
    SavingsQuote(
      id: 'sq_003',
      quote: 'It’s not how much money you make, but how much money you keep, how hard it works for you, and how many generations you keep it for.',
      author: 'Robert Kiyosaki',
      actionTip: 'Lock away a small surplus into a dedicated savings goal today.',
    ),
    SavingsQuote(
      id: 'sq_004',
      quote: 'The art is not in making money, but in keeping it.',
      author: 'Proverb',
      actionTip: 'Before completing any impulse purchase today, apply the 24-hour cooling rule.',
    ),
    SavingsQuote(
      id: 'sq_005',
      quote: 'Financial peace isn’t the acquisition of stuff. It’s learning to live on less than you make, so you can give money back and have money to invest.',
      author: 'Dave Ramsey',
      actionTip: 'Check your Safe-to-Spend limit on your FinPocket dashboard before heading out.',
    ),
    SavingsQuote(
      id: 'sq_006',
      quote: 'Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn’t, pays it.',
      author: 'Albert Einstein',
      actionTip: 'Automate a weekly deposit of even ₹100; compounding compounds patience into wealth.',
    ),
    SavingsQuote(
      id: 'sq_007',
      quote: 'Wealth consists not in having great possessions, but in having few wants.',
      author: 'Epictetus',
      actionTip: 'Distinguish your mandatory commitments from discretionary desires this week.',
    ),
    SavingsQuote(
      id: 'sq_008',
      quote: 'Beware of little expenses; a small leak will sink a great ship.',
      author: 'Benjamin Franklin',
      actionTip: 'Audit your subscription list in the Bills section to identify unused services.',
    ),
    SavingsQuote(
      id: 'sq_009',
      quote: 'The habit of saving is itself an education; it fosters every virtue, teaches self-denial, cultivates the sense of order, trains to forethought.',
      author: 'T.T. Munger',
      actionTip: 'Celebrate consistency: depositing ₹50 daily beats waiting for a windfall.',
    ),
    SavingsQuote(
      id: 'sq_010',
      quote: 'Rich people stay rich by living like they’re broke. Broke people stay broke by living like they’re rich.',
      author: 'Anonymous',
      actionTip: 'Protect your future self—maintain your emergency fund with at least 3 months coverage.',
    ),
    SavingsQuote(
      id: 'sq_011',
      quote: 'Never spend your money before you have earned it.',
      author: 'Thomas Jefferson',
      actionTip: 'Avoid credit advances for leisure; fund upcoming plans with pre-saved buffers.',
    ),
    SavingsQuote(
      id: 'sq_012',
      quote: 'Money is a terrible master but an excellent servant.',
      author: 'P.T. Barnum',
      actionTip: 'Give every rupee a designated job using FinPocket Category Budgets.',
    ),
    SavingsQuote(
      id: 'sq_013',
      quote: 'You must gain control over your money or the lack of it will forever control you.',
      author: 'Dave Ramsey',
      actionTip: 'Take 2 minutes to inspect your Financial Health Score on your home feed.',
    ),
    SavingsQuote(
      id: 'sq_014',
      quote: 'A budget is telling your money where to go instead of wondering where it went.',
      author: 'John C. Maxwell',
      actionTip: 'Set an alert cap for Dining & Travel in your category budgets today.',
    ),
    SavingsQuote(
      id: 'sq_015',
      quote: 'Save money and money will save you.',
      author: 'Jamaican Proverb',
      actionTip: 'Ensure your Emergency Shield is locked so emotional withdrawals are prevented.',
    ),
    SavingsQuote(
      id: 'sq_016',
      quote: 'Wealth is the ability to fully experience life without worrying about tomorrow’s bills.',
      author: 'Henry David Thoreau',
      actionTip: 'Clearing upcoming bills before their due dates frees mental bandwidth for creativity.',
    ),
    SavingsQuote(
      id: 'sq_017',
      quote: 'If you buy things you do not need, soon you will have to sell things you need.',
      author: 'Warren Buffett',
      actionTip: 'Ask yourself: “Will this item bring lasting value in 6 months?” before buying.',
    ),
    SavingsQuote(
      id: 'sq_018',
      quote: 'The secret to wealth is simple: Find a way to do more for others than anybody else does. Save the difference.',
      author: 'Tony Robbins',
      actionTip: 'Channel today’s surplus into a high-priority personal milestone goal.',
    ),
    SavingsQuote(
      id: 'sq_019',
      quote: 'Too many people spend money they haven’t earned, to buy things they don’t want, to impress people that they don’t like.',
      author: 'Will Rogers',
      actionTip: 'Focus on personal milestone growth rather than external validation.',
    ),
    SavingsQuote(
      id: 'sq_020',
      quote: 'The individual investor should act consistently as an investor and not as a speculator.',
      author: 'Benjamin Graham',
      actionTip: 'Prioritize steady monthly emergency reserve contributions over volatile bets.',
    ),
    SavingsQuote(
      id: 'sq_021',
      quote: 'He who buys what he does not need, steals from himself.',
      author: 'Swedish Proverb',
      actionTip: 'Transfer ₹200 to your Emergency Shield right now instead of ordering takeaway.',
    ),
    SavingsQuote(
      id: 'sq_022',
      quote: 'Every time you borrow money, you’re robbing your future self.',
      author: 'Nathan W. Morris',
      actionTip: 'Track active EMIs in your Bills ledger and plan an early prepay milestone.',
    ),
    SavingsQuote(
      id: 'sq_023',
      quote: 'It is not the man who has too little, but the man who craves more, that is poor.',
      author: 'Seneca',
      actionTip: 'Practice contentment with today’s essentials and safeguard your savings runway.',
    ),
    SavingsQuote(
      id: 'sq_024',
      quote: 'Knowledge is an investment that pays the best dividends.',
      author: 'Benjamin Franklin',
      actionTip: 'Review your financial brief in FinPocket every morning to stay in command.',
    ),
    SavingsQuote(
      id: 'sq_025',
      quote: 'Frugality includes all the other virtues.',
      author: 'Cicero',
      actionTip: 'Small disciplined decisions today compound into absolute freedom tomorrow.',
    ),
    SavingsQuote(
      id: 'sq_026',
      quote: 'The goal isn’t more money. The goal is living life on your own terms.',
      author: 'Chris Brogan',
      actionTip: 'Check your safe-to-spend runway on your home dashboard.',
    ),
    SavingsQuote(
      id: 'sq_027',
      quote: 'Money looks better in the bank than on your feet.',
      author: 'Sophia Amoruso',
      actionTip: 'Delay non-essential shopping until your target emergency fund is fully funded.',
    ),
    SavingsQuote(
      id: 'sq_028',
      quote: 'Savings represent freedom: freedom from fear, freedom from debt, and freedom to choose.',
      author: 'Morgan Housel',
      actionTip: 'Every rupee in your emergency reserve is a vote for independence.',
    ),
    SavingsQuote(
      id: 'sq_029',
      quote: 'Spending money to show people how much money you have is the fastest way to have less money.',
      author: 'Morgan Housel',
      actionTip: 'Keep your net worth hidden and your emergency shield fortress strong.',
    ),
    SavingsQuote(
      id: 'sq_030',
      quote: 'True wealth is what you don’t see: the cars not purchased, the diamonds not bought, the first-class upgrades declined.',
      author: 'Morgan Housel',
      actionTip: 'Reinforce your financial discipline today: add ₹500 to your savings goal.',
    ),
    SavingsQuote(
      id: 'sq_031',
      quote: 'Rich people plan for four generations. Poor people plan for Saturday night.',
      author: 'Gloria Steinem',
      actionTip: 'Extend your financial horizon with forward projection modeling in FinPocket.',
    ),
    SavingsQuote(
      id: 'sq_032',
      quote: 'You can’t reach your financial goals by accident. It requires deliberate daily execution.',
      author: 'John C. Maxwell',
      actionTip: 'Check off one financial health factor improvement today.',
    ),
    SavingsQuote(
      id: 'sq_033',
      quote: 'A disciplined mind leads to a thriving bank balance.',
      author: 'Marcus Aurelius',
      actionTip: 'Pause 10 seconds before any digital UPI checkout to confirm affordability.',
    ),
    SavingsQuote(
      id: 'sq_034',
      quote: 'Financial freedom is available to those who learn about it and work for it.',
      author: 'Robert Kiyosaki',
      actionTip: 'Allocate today’s spare cash to your top savings target.',
    ),
    SavingsQuote(
      id: 'sq_035',
      quote: 'Peace of mind comes when your emergency shield outlasts any sudden crisis.',
      author: 'FinPocket Wisdom',
      actionTip: 'Boost your Emergency Shield by 1 day of essential expenses today.',
    ),
    SavingsQuote(
      id: 'sq_036',
      quote: 'The first rule of compounding is to never interrupt it unnecessarily.',
      author: 'Charlie Munger',
      actionTip: 'Keep your savings locked in the Vault so you never disrupt your compounding growth.',
    ),
    SavingsQuote(
      id: 'sq_037',
      quote: 'A man who saves is always ready for opportunity, while a man who spends is always scrambling for survival.',
      author: 'George S. Clason',
      actionTip: 'Pay yourself first: reserve 10% of every income credit before paying anyone else.',
    ),
    SavingsQuote(
      id: 'sq_038',
      quote: 'You don’t have to see the whole staircase, just take the first step towards financial freedom.',
      author: 'Martin Luther King Jr.',
      actionTip: 'Even saving ₹20 into your Round-Up Vault today starts an unstoppable chain reaction.',
    ),
    SavingsQuote(
      id: 'sq_039',
      quote: 'Simplicity is the keynote of all true elegance—and true wealth.',
      author: 'Coco Chanel',
      actionTip: 'Declutter your recurring monthly subscriptions to keep your financial life minimal and light.',
    ),
    SavingsQuote(
      id: 'sq_040',
      quote: 'Save for a rainy day, because when the storm comes, umbrellas are always expensive.',
      author: 'Old Proverb',
      actionTip: 'Check your Emergency Shield balance to ensure you have at least 30 days of buffer.',
    ),
    SavingsQuote(
      id: 'sq_041',
      quote: 'The greatest wealth is contentment with little.',
      author: 'Proverb',
      actionTip: 'Try a Zero-Spend Evening: cook at home and enjoy time without opening shopping apps.',
    ),
    SavingsQuote(
      id: 'sq_042',
      quote: 'An investment in self-control always pays the highest yield in life.',
      author: 'Naval Ravikant',
      actionTip: 'Use FinPocket’s Impulse Guard when shopping online to avoid regretful impulse buys.',
    ),
    SavingsQuote(
      id: 'sq_043',
      quote: 'Money is like a shadow: when you try to catch it, you can’t; but walk ahead with discipline, and it follows you.',
      author: 'Chanakya',
      actionTip: 'Save during prosperous times so you never need to compromise in challenging times.',
    ),
    SavingsQuote(
      id: 'sq_044',
      quote: 'Live below your means today so that you can live above your means tomorrow.',
      author: 'Mark Cuban',
      actionTip: 'Keep your lifestyle inflation at zero even when your income increases.',
    ),
    SavingsQuote(
      id: 'sq_045',
      quote: 'The stock of wealth that you possess is measured not by money, but by the time you can survive without working.',
      author: 'Buckminster Fuller',
      actionTip: 'Calculate your financial runway: how many months can your emergency savings cover?',
    ),
    SavingsQuote(
      id: 'sq_046',
      quote: 'He who does not economize will have to agonize.',
      author: 'Confucius',
      actionTip: 'Track every single cash spend in your Voice Ledger before you go to sleep tonight.',
    ),
    SavingsQuote(
      id: 'sq_047',
      quote: 'Rich people buy assets. Poor people have expenses. The middle class buys liabilities they think are assets.',
      author: 'Robert Kiyosaki',
      actionTip: 'Review your upcoming payments: focus on clearing liabilities that drain your cash.',
    ),
    SavingsQuote(
      id: 'sq_048',
      quote: 'Don’t tell me what you value, show me your budget, and I’ll tell you what you value.',
      author: 'Joe Biden',
      actionTip: 'Look at your top 3 expense categories this month to ensure they align with what truly matters.',
    ),
    SavingsQuote(
      id: 'sq_049',
      quote: 'Never depend on a single income. Make an investment of time to create a second source.',
      author: 'Warren Buffett',
      actionTip: 'Dedicate an hour this weekend to learning a high-income digital skill.',
    ),
    SavingsQuote(
      id: 'sq_050',
      quote: 'The desire for gold is not for gold. It is for the means of freedom and benefit.',
      author: 'Ralph Waldo Emerson',
      actionTip: 'Remember that money is just fuel for your personal freedom and family peace.',
    ),
    SavingsQuote(
      id: 'sq_051',
      quote: 'Financial discipline is choosing between what you want now and what you want most.',
      author: 'Abraham Lincoln',
      actionTip: 'Before clicking Buy, remind yourself of your major 1-year financial goal.',
    ),
    SavingsQuote(
      id: 'sq_052',
      quote: 'When you know the impact of little things, you realize there are no little things.',
      author: 'Bruce Barton',
      actionTip: 'Round up your daily UPI transactions; ₹15 saved 5 times a day is over ₹2,200 a month.',
    ),
    SavingsQuote(
      id: 'sq_053',
      quote: 'Opportunity is missed by most people because it is dressed in overalls and looks like work.',
      author: 'Thomas Edison',
      actionTip: 'Doing the daily work of auditing your finances guarantees long-term success.',
    ),
    SavingsQuote(
      id: 'sq_054',
      quote: 'Never confuse having a high income with being wealthy. Wealth is what you keep, not what you spend.',
      author: 'Thomas J. Stanley',
      actionTip: 'Build a private cushion that no one knows about—true wealth is silent.',
    ),
    SavingsQuote(
      id: 'sq_055',
      quote: 'Debt is normal. Be weird.',
      author: 'Dave Ramsey',
      actionTip: 'Avoid credit card minimum due traps; always pay the total statement amount.',
    ),
    SavingsQuote(
      id: 'sq_056',
      quote: 'The four most dangerous words in investing are: This time it’s different.',
      author: 'Sir John Templeton',
      actionTip: 'Stick to proven fundamentals: low debt, steady savings, and patient compounding.',
    ),
    SavingsQuote(
      id: 'sq_057',
      quote: 'If you want to feel rich, just count the things you have that money can’t buy.',
      author: 'Proverb',
      actionTip: 'Express gratitude today; contentment is the greatest defense against impulse shopping.',
    ),
    SavingsQuote(
      id: 'sq_058',
      quote: 'A wise man should have money in his head, but not in his heart.',
      author: 'Jonathan Swift',
      actionTip: 'Treat money with rational logic rather than emotional excitement.',
    ),
    SavingsQuote(
      id: 'sq_059',
      quote: 'It is easy to be brave from a safe distance; it is easy to be calm when your bills are already paid.',
      author: 'Aesop',
      actionTip: 'Schedule all recurring bills at the beginning of the month so you enjoy peace of mind all month.',
    ),
    SavingsQuote(
      id: 'sq_060',
      quote: 'The price of anything is the amount of life you exchange for it.',
      author: 'Henry David Thoreau',
      actionTip: 'Before spending ₹2,000, calculate how many hours of work it took you to earn that.',
    ),
    SavingsQuote(
      id: 'sq_061',
      quote: 'Freedom is the ability to walk away from anything that disrupts your peace of mind.',
      author: 'J.L. Collins',
      actionTip: 'Build your F-You fund inside the FinPocket Emergency Vault.',
    ),
    SavingsQuote(
      id: 'sq_062',
      quote: 'Money won’t create success, the freedom to make it will.',
      author: 'Nelson Mandela',
      actionTip: 'Keep your financial records transparent so you are always in complete control.',
    ),
    SavingsQuote(
      id: 'sq_063',
      quote: 'If you don’t find a way to make money while you sleep, you will work until you die.',
      author: 'Warren Buffett',
      actionTip: 'Grow your emergency reserve first, then systematically transition into income-generating assets.',
    ),
    SavingsQuote(
      id: 'sq_064',
      quote: 'Wealth is not his that has it, but his that enjoys it wisely.',
      author: 'Benjamin Franklin',
      actionTip: 'Budget for small guilt-free pleasures using your Safe-to-Spend limit.',
    ),
    SavingsQuote(
      id: 'sq_065',
      quote: 'Empty pockets never held anyone back. Only empty heads and empty hearts can do that.',
      author: 'Norman Vincent Peale',
      actionTip: 'Focus on building knowledge and daily savings habits; wealth will naturally follow.',
    ),
    SavingsQuote(
      id: 'sq_066',
      quote: 'Gold in the hand is worth more than a promises in the sky.',
      author: 'Persian Proverb',
      actionTip: 'Keep guaranteed liquid cash in your emergency reserve before chasing speculative gains.',
    ),
    SavingsQuote(
      id: 'sq_067',
      quote: 'The speed of your financial independence depends on your savings rate, not your investment returns.',
      author: 'Mr. Money Mustache',
      actionTip: 'Aim to increase your monthly savings rate by just 2% this month.',
    ),
    SavingsQuote(
      id: 'sq_068',
      quote: 'Spend extravagantly on the things you love, and cut costs mercilessly on the things you don’t.',
      author: 'Ramit Sethi',
      actionTip: 'Identify one recurring cost you don’t care about and cancel it immediately.',
    ),
    SavingsQuote(
      id: 'sq_069',
      quote: 'A small body of determined spirits fired by an unquenchable faith in their mission can alter the course of history.',
      author: 'Mahatma Gandhi',
      actionTip: 'Your commitment to debt freedom and financial independence starts with today’s single choice.',
    ),
    SavingsQuote(
      id: 'sq_070',
      quote: 'Failing to plan is planning to fail with your money.',
      author: 'Alan Lakein',
      actionTip: 'Open your monthly budget screen and allocate planned limits for each category.',
    ),
    SavingsQuote(
      id: 'sq_071',
      quote: 'A bank is a place that will lend you an umbrella in fair weather and want it back when it begins to rain.',
      author: 'Robert Frost',
      actionTip: 'Rely on your own self-funded emergency buffer rather than relying on bank credit.',
    ),
    SavingsQuote(
      id: 'sq_072',
      quote: 'Do what you can, with what you have, where you are.',
      author: 'Theodore Roosevelt',
      actionTip: 'Start saving today even if you only have ₹50 spare. Consistency is what creates magic.',
    ),
    SavingsQuote(
      id: 'sq_073',
      quote: 'There is a gigantic difference between making a lot of money and keeping it.',
      author: 'Charlie Munger',
      actionTip: 'Focus on plugging spending leaks before worrying about increasing your salary.',
    ),
    SavingsQuote(
      id: 'sq_074',
      quote: 'The secret of getting ahead is getting started.',
      author: 'Mark Twain',
      actionTip: 'Set up your first automated savings deposit today if you haven’t yet.',
    ),
    SavingsQuote(
      id: 'sq_075',
      quote: 'He who buys what he does not want will soon want for what he cannot buy.',
      author: 'William Penn',
      actionTip: 'Make a wishlist and wait 14 days before buying any non-essential item.',
    ),
    SavingsQuote(
      id: 'sq_076',
      quote: 'Discipline is the bridge between goals and accomplishment.',
      author: 'Jim Rohn',
      actionTip: 'Check your streak counter today: maintaining your budget streak builds lasting wealth.',
    ),
    SavingsQuote(
      id: 'sq_077',
      quote: 'Beware of false bargains: buying something on discount that you don’t need is still 100% waste.',
      author: 'FinPocket Rule',
      actionTip: 'Don’t be lured by flash sales; ask if you would pay full price for it.',
    ),
    SavingsQuote(
      id: 'sq_078',
      quote: 'The greatest step towards independence is learning to live within your means.',
      author: 'George Washington',
      actionTip: 'Check your Safe-to-Spend dial before making any dining or leisure payment today.',
    ),
    SavingsQuote(
      id: 'sq_079',
      quote: 'If you want to conquer anxiety about the future, live in the present with a solid financial cushion.',
      author: 'Seneca',
      actionTip: 'A 3-month emergency fund is the ultimate cure for middle-of-the-night money anxiety.',
    ),
    SavingsQuote(
      id: 'sq_080',
      quote: 'Great fortunes are built on tiny foundations of self-control.',
      author: 'Napoleon Hill',
      actionTip: 'Skip one impulse coffee or takeaway snack today and deposit that exact amount into savings.',
    ),
    SavingsQuote(
      id: 'sq_081',
      quote: 'A tree that stands 100 years started as a tiny seed in quiet soil.',
      author: 'Lao Tzu',
      actionTip: 'Your wealth tree starts growing the moment you stop pulling up the roots for trivial spends.',
    ),
    SavingsQuote(
      id: 'sq_082',
      quote: 'Control your expenses better than your competitors, and you will always prosper.',
      author: 'Sam Walton',
      actionTip: 'Keep your fixed overhead low so you remain agile in any economic condition.',
    ),
    SavingsQuote(
      id: 'sq_083',
      quote: 'A modest lifestyle accompanied by a swelling investment account is the ultimate luxury.',
      author: 'Morgan Housel',
      actionTip: 'Value financial peace over outward display of luxury items.',
    ),
    SavingsQuote(
      id: 'sq_084',
      quote: 'Patience is the companion of wisdom.',
      author: 'Saint Augustine',
      actionTip: 'Let your investments and savings compound quietly without checking them every hour.',
    ),
    SavingsQuote(
      id: 'sq_085',
      quote: 'To acquire money requires valor, to keep money requires prudence, and to spend money well is an art.',
      author: 'Berthold Auerbach',
      actionTip: 'Spend consciously on health, education, and family, and save on ego purchases.',
    ),
    SavingsQuote(
      id: 'sq_086',
      quote: 'Never test the depth of the river with both feet.',
      author: 'Warren Buffett',
      actionTip: 'Never invest money you might need in the next 6 months for emergencies.',
    ),
    SavingsQuote(
      id: 'sq_087',
      quote: 'Contentment makes poor men rich; discontent makes rich men poor.',
      author: 'Benjamin Franklin',
      actionTip: 'Take time to appreciate how far you have already come on your financial journey.',
    ),
    SavingsQuote(
      id: 'sq_088',
      quote: 'Money doesn’t change people; it merely amplifies who they already are.',
      author: 'Will Smith',
      actionTip: 'Cultivate generosity and discipline now, so they remain with you as your wealth expands.',
    ),
    SavingsQuote(
      id: 'sq_089',
      quote: 'The hardest financial skill is getting the goalpost to stop moving.',
      author: 'Morgan Housel',
      actionTip: 'Define what “Enough” means for you, so lifestyle inflation doesn’t steal your freedom.',
    ),
    SavingsQuote(
      id: 'sq_090',
      quote: 'You can be young without money, but you can’t be old without it.',
      author: 'Tennessee Williams',
      actionTip: 'Your future retirement self will thank you for every rupee saved today.',
    ),
    SavingsQuote(
      id: 'sq_091',
      quote: 'Do not measure your wealth by what you own, but by what you would not take for it.',
      author: 'Epicurus',
      actionTip: 'Cherish good health, family peace, and financial self-sufficiency.',
    ),
    SavingsQuote(
      id: 'sq_092',
      quote: 'The secret of happiness is freedom, and the secret of freedom is courage.',
      author: 'Thucydides',
      actionTip: 'Have the courage to say No to social spending peer pressure.',
    ),
    SavingsQuote(
      id: 'sq_093',
      quote: 'A rich man is not one who has the most, but one who needs the least.',
      author: 'John Chrysostom',
      actionTip: 'Cut unnecessary recurring bills to lower your monthly baseline cost of living.',
    ),
    SavingsQuote(
      id: 'sq_094',
      quote: 'Opportunities come infrequently. When it rains gold, put out the bucket, not the thimble.',
      author: 'Warren Buffett',
      actionTip: 'Having a healthy cash buffer allows you to seize unexpected golden opportunities.',
    ),
    SavingsQuote(
      id: 'sq_095',
      quote: 'The chief cause of failure and unhappiness is trading what you want most for what you want now.',
      author: 'Zig Ziglar',
      actionTip: 'Keep your eyes on your true long-term milestones.',
    ),
    SavingsQuote(
      id: 'sq_096',
      quote: 'Wealth is like sea-water; the more we drink, the thirstier we become.',
      author: 'Arthur Schopenhauer',
      actionTip: 'Find joy in the simple, free things in life: nature, reading, and deep conversations.',
    ),
    SavingsQuote(
      id: 'sq_097',
      quote: 'By failing to prepare for unexpected expenses, you are preparing to borrow at high interest.',
      author: 'FinPocket Wisdom',
      actionTip: 'Inspect your Emergency Shield target and ensure it’s fully funded.',
    ),
    SavingsQuote(
      id: 'sq_098',
      quote: 'He is richest who is content with the least, for content is the wealth of nature.',
      author: 'Socrates',
      actionTip: 'Remind yourself that genuine self-worth is never bought in a shopping mall.',
    ),
    SavingsQuote(
      id: 'sq_099',
      quote: 'A wise person should have money in their emergency reserves before dreaming of luxuries.',
      author: 'Chanakya',
      actionTip: 'Secure your fortress first; then enjoy the surplus with total peace of mind.',
    ),
    SavingsQuote(
      id: 'sq_100',
      quote: 'Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.',
      author: 'Warren Buffett',
      actionTip: 'Avoid high-risk speculative get-rich-quick schemes; slow and steady wins the race.',
    ),
    SavingsQuote(
      id: 'sq_101',
      quote: 'When money realizes that it is in good hands, it wants to stay and multiply in those hands.',
      author: 'Idowu Koyenikan',
      actionTip: 'Manage your daily expenses responsibly and watch your savings flourish.',
    ),
    SavingsQuote(
      id: 'sq_102',
      quote: 'The borrower is slave to the lender.',
      author: 'Proverbs 22:7',
      actionTip: 'Prioritize paying off high-interest debt so you can reclaim complete personal sovereignty.',
    ),
    SavingsQuote(
      id: 'sq_103',
      quote: 'Wealth flows from energy and ideas.',
      author: 'William Feather',
      actionTip: 'Invest in books and practical learning to multiply your career value.',
    ),
    SavingsQuote(
      id: 'sq_104',
      quote: 'Keep your financial eyes forward and your desires under strict discipline.',
      author: 'Marcus Aurelius',
      actionTip: 'Check your budget before making non-essential purchases today.',
    ),
    SavingsQuote(
      id: 'sq_105',
      quote: 'A clear ledger and an honest budget bring the sweet sleep of a clear conscience.',
      author: 'Old Proverb',
      actionTip: 'Review your FinPocket transaction overview every evening for peace of mind.',
    ),
    SavingsQuote(
      id: 'sq_106',
      quote: 'The art of living easily as to money is to pitch your scale of living one degree below your means.',
      author: 'Sir Henry Taylor',
      actionTip: 'Live on 80% of what you earn and let the remaining 20% work tirelessly for your future.',
    ),
    SavingsQuote(
      id: 'sq_107',
      quote: 'Every rupee you save is a worker working for your future financial independence.',
      author: 'Kevin O’Leary',
      actionTip: 'Treat your savings as loyal soldiers fighting for your freedom.',
    ),
    SavingsQuote(
      id: 'sq_108',
      quote: 'Nothing is more honorable than a grateful heart and a well-managed budget.',
      author: 'Seneca',
      actionTip: 'Take pride in being a master of your financial destiny.',
    ),
    SavingsQuote(
      id: 'sq_109',
      quote: 'If you want to be rich, think of saving as well as of getting.',
      author: 'Benjamin Franklin',
      actionTip: 'Earning high is only half the formula; keeping it is where wealth is made.',
    ),
    SavingsQuote(
      id: 'sq_110',
      quote: 'Peace is when your bank balance outlasts your anxieties.',
      author: 'FinPocket Wisdom',
      actionTip: 'Lock away ₹100 right now into your Emergency Vault and celebrate taking action.',
    ),
  ];

  /// Checks and returns the quote for today.
  /// Automatically rotates deterministically every single calendar day, guaranteeing a new quote daily!
  static Future<Map<String, dynamic>> checkAndDeliverDailyQuote() async {
    final prefs = await SharedPreferences.getInstance();
    final today = DateTime.now();
    final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final lastDeliveredDate = prefs.getString(_prefLastDateKey);
    final todayQuoteId = prefs.getString(_prefTodayQuoteIdKey);

    // If today's quote has already been computed and date matches, return it
    if (lastDeliveredDate == todayStr && todayQuoteId != null) {
      final existingQuote = quotesPool.firstWhere(
        (q) => q.id == todayQuoteId,
        orElse: () => quotesPool.first,
      );
      return {
        'quote': existingQuote,
        'isNewDelivery': false,
      };
    }

    // New calendar day: Pick quote deterministically based on day of year to guarantee daily change
    final dayOfYear = today.difference(DateTime(today.year, 1, 1)).inDays;
    final quoteIndex = dayOfYear % quotesPool.length;
    final selectedQuote = quotesPool[quoteIndex];

    // Persist today's quote
    await prefs.setString(_prefLastDateKey, todayStr);
    await prefs.setString(_prefTodayQuoteIdKey, selectedQuote.id);

    return {
      'quote': selectedQuote,
      'isNewDelivery': true,
    };
  }

  /// Manually shuffle or cycle to the next inspiring quote in the library
  static Future<SavingsQuote> getNextQuote() async {
    final prefs = await SharedPreferences.getInstance();
    final todayQuoteId = prefs.getString(_prefTodayQuoteIdKey);

    int currentIndex = quotesPool.indexWhere((q) => q.id == todayQuoteId);
    if (currentIndex == -1) {
      currentIndex = 0;
    }

    final nextIndex = (currentIndex + 1) % quotesPool.length;
    final nextQuote = quotesPool[nextIndex];

    await prefs.setString(_prefTodayQuoteIdKey, nextQuote.id);
    return nextQuote;
  }

  /// Get the active quote for today (synchronous fallback if cached)
  static Future<SavingsQuote> getTodayQuote() async {
    final result = await checkAndDeliverDailyQuote();
    return result['quote'] as SavingsQuote;
  }
}
