import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../theme/app_theme.dart';
import 'twin_models.dart';
import 'twin_engine.dart';

class WhatIfLabScreen extends StatefulWidget {
  const WhatIfLabScreen({super.key});

  @override
  State<WhatIfLabScreen> createState() => _WhatIfLabScreenState();
}

class _WhatIfLabScreenState extends State<WhatIfLabScreen> {
  double _customAmount = 45000.0;
  String _selectedPreset = 'phone';
  ScenarioType _selectedType = ScenarioType.largePurchase;
  bool _isRecurring = false;
  final TextEditingController _amountController = TextEditingController(text: '45000');
  final TextEditingController _nameController = TextEditingController(text: 'New Flagship Smartphone');

  @override
  void dispose() {
    _amountController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _applyPreset(String key) {
    setState(() {
      _selectedPreset = key;
      switch (key) {
        case 'phone':
          _customAmount = 65000.0;
          _selectedType = ScenarioType.largePurchase;
          _isRecurring = false;
          _nameController.text = 'Flagship Smartphone';
          break;
        case 'rent':
          _customAmount = 6000.0;
          _selectedType = ScenarioType.rentOrExpenseHike;
          _isRecurring = true;
          _nameController.text = 'Apartment Rent Hike';
          break;
        case 'vacation':
          _customAmount = 35000.0;
          _selectedType = ScenarioType.largePurchase;
          _isRecurring = false;
          _nameController.text = 'Spontaneous 4-Day Getaway';
          break;
        case 'medical':
          _customAmount = 20000.0;
          _selectedType = ScenarioType.emergencyExpense;
          _isRecurring = false;
          _nameController.text = 'Dental or Medical Emergency';
          break;
        case 'custom':
          break;
      }
      _amountController.text = _customAmount.toInt().toString();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final projection = FinancialTwinEngine.generateProjection(
      accounts: state.accounts,
      transactions: state.transactions,
      bills: state.bills,
      goals: state.goals,
    );

    final currentScenario = WhatIfScenario(
      id: 'sim_active',
      title: _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : 'Custom Scenario',
      description: 'Interactive simulation',
      type: _selectedType,
      amount: _customAmount,
      isRecurring: _isRecurring,
    );

    final simulation = FinancialTwinEngine.simulateScenario(
      baseline: projection,
      scenario: currentScenario,
      goals: state.goals,
    );

    return Scaffold(
      backgroundColor: isDark ? AppTheme.bgDark : AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Digital Twin & What-If Lab', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline, size: 20),
            tooltip: 'Explain Digital Twin',
            onPressed: () => _showTwinExplanation(context),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildTwinMetricsCard(projection, isDark),
            const SizedBox(height: 16),
            _buildScenarioSelector(isDark),
            const SizedBox(height: 16),
            _buildScenarioControls(isDark),
            const SizedBox(height: 16),
            _buildSimulationResultsCard(simulation, projection, isDark),
            const SizedBox(height: 16),
            _build90DayForecast(projection, simulation, isDark),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildTwinMetricsCard(TwinProjection twin, bool isDark) {
    final riskColor = twin.riskTier == LiquidityRiskTier.low
        ? AppTheme.accentGreen
        : twin.riskTier == LiquidityRiskTier.moderate
            ? Colors.amber
            : AppTheme.accentRed;

    final riskLabel = twin.riskTier == LiquidityRiskTier.low
        ? 'Healthy & Resilient'
        : twin.riskTier == LiquidityRiskTier.moderate
            ? 'Moderate Caution'
            : 'Liquidity Vulnerability';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.08) : Colors.black.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Expanded(
                child: Row(
                  children: [
                    Icon(Icons.hub_outlined, color: AppTheme.primary, size: 20),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Live Twin Baseline',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: riskColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: riskColor.withOpacity(0.4)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 6, height: 6, decoration: BoxDecoration(color: riskColor, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text(riskLabel, style: TextStyle(color: riskColor, fontSize: 11, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  title: 'Runway',
                  value: '${twin.runwayDays} Days',
                  subtitle: '${twin.runwayMonths.toStringAsFixed(1)} mos buffer',
                  isDark: isDark,
                  icon: Icons.timer_outlined,
                  iconColor: Colors.blueAccent,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMetricTile(
                  title: 'Safe-To-Spend',
                  value: '₹${twin.safeToSpendDaily.toStringAsFixed(0)}/day',
                  subtitle: '₹${twin.safeToSpendMonthly.toStringAsFixed(0)} cycle',
                  isDark: isDark,
                  icon: Icons.shield_outlined,
                  iconColor: AppTheme.accentGreen,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  title: 'Liquid Reserves',
                  value: '₹${twin.currentLiquidBalance.toStringAsFixed(0)}',
                  subtitle: 'Checking & Wallets',
                  isDark: isDark,
                  icon: Icons.account_balance_wallet_outlined,
                  iconColor: Colors.purpleAccent,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMetricTile(
                  title: 'Burn Rate',
                  value: '₹${twin.dailyBurnRate.toStringAsFixed(0)}/day',
                  subtitle: '₹${twin.fixedMonthlyObligations.toStringAsFixed(0)} fixed bills',
                  isDark: isDark,
                  icon: Icons.trending_down,
                  iconColor: Colors.orangeAccent,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String title,
    required String value,
    required String subtitle,
    required bool isDark,
    required IconData icon,
    required Color iconColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: iconColor),
              const SizedBox(width: 4),
              Text(title, style: TextStyle(fontSize: 11, color: isDark ? Colors.white60 : Colors.black54)),
            ],
          ),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          Text(subtitle, style: TextStyle(fontSize: 10, color: isDark ? Colors.white38 : Colors.black38)),
        ],
      ),
    );
  }

  Widget _buildScenarioSelector(bool isDark) {
    final presets = [
      {'key': 'phone', 'label': '📱 New Phone', 'amount': '₹65K'},
      {'key': 'rent', 'label': '🏠 Rent Hike', 'amount': '+₹6K/m'},
      {'key': 'vacation', 'label': '✈️ Vacation', 'amount': '₹35K'},
      {'key': 'medical', 'label': '🩹 Emergency', 'amount': '₹20K'},
      {'key': 'custom', 'label': '⚙️ Custom', 'amount': ''},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Explore What-If Scenarios', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: presets.map((preset) {
              final isSelected = _selectedPreset == preset['key'];
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text('${preset['label']} ${preset['amount']}'.trim()),
                  selected: isSelected,
                  selectedColor: AppTheme.primary,
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : (isDark ? Colors.white70 : Colors.black87),
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                  onSelected: (selected) {
                    if (selected) _applyPreset(preset['key']!);
                  },
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildScenarioControls(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.08) : Colors.black.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Scenario Parameters', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text(
                '₹${_customAmount.toInt()}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.primary),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: 'Scenario Title',
              isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 12),
          Slider(
            value: _customAmount.clamp(1000.0, 250000.0),
            min: 1000.0,
            max: 250000.0,
            divisions: 249,
            activeColor: AppTheme.primary,
            label: '₹${_customAmount.toInt()}',
            onChanged: (val) {
              setState(() {
                _customAmount = val;
                _amountController.text = val.toInt().toString();
              });
            },
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('₹1,000', style: TextStyle(fontSize: 10, color: isDark ? Colors.white38 : Colors.black38)),
              Text('₹1,25,000', style: TextStyle(fontSize: 10, color: isDark ? Colors.white38 : Colors.black38)),
              Text('₹2,50,000', style: TextStyle(fontSize: 10, color: isDark ? Colors.white38 : Colors.black38)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSimulationResultsCard(ScenarioSimulation sim, TwinProjection baseline, bool isDark) {
    final verdictColor = sim.isViable ? AppTheme.accentGreen : AppTheme.accentRed;
    final verdictIcon = sim.isViable ? Icons.check_circle_outline : Icons.warning_amber_rounded;
    final verdictTitle = sim.isViable ? 'Affordable & Sustainable' : 'High Financial Strain Alert';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: verdictColor.withOpacity(0.5), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(verdictIcon, color: verdictColor, size: 24),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(verdictTitle, style: TextStyle(color: verdictColor, fontWeight: FontWeight.bold, fontSize: 16)),
                    Text(
                      'Runway shifts from ${sim.baselineRunwayDays}d ➔ ${sim.projectedRunwayDays}d (${sim.runwayDeltaDays} days)',
                      style: TextStyle(fontSize: 12, color: isDark ? Colors.white70 : Colors.black87),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(),
          const SizedBox(height: 8),
          const Text('Actionable Twin Intelligence', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 8),
          ...sim.actionableAdvice.map((advice) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.arrow_right_rounded, size: 18, color: AppTheme.primary),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(advice, style: TextStyle(fontSize: 12, color: isDark ? Colors.white70 : Colors.black87, height: 1.3)),
                    ),
                  ],
                ),
              )),
          if (sim.affectedGoals.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.amber.withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.flag_outlined, color: Colors.amber, size: 16),
                      SizedBox(width: 6),
                      Text('Goal Timeline Delay Impact', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.amber, fontSize: 12)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ...sim.affectedGoals.map((g) => Text(
                        '• ${g.goalTitle}: Target deferred by ~${g.delayDays} days',
                        style: TextStyle(fontSize: 11, color: isDark ? Colors.white70 : Colors.black87),
                      )),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _build90DayForecast(TwinProjection baseline, ScenarioSimulation sim, bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.08) : Colors.black.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('90-Day Liquidity Trajectory', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text('Deterministic', style: TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 110,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: baseline.forecastPoints.length,
              itemBuilder: (ctx, idx) {
                final pt = baseline.forecastPoints[idx];
                final isNegative = pt.projectedBalance < 0;
                final color = isNegative ? AppTheme.accentRed : AppTheme.accentGreen;
                return Container(
                  width: 90,
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: color.withOpacity(0.3)),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Day ${(idx + 1) * 5}',
                        style: TextStyle(fontSize: 10, color: isDark ? Colors.white60 : Colors.black54),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '₹${(pt.projectedBalance / 1000).toStringAsFixed(1)}K',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: color),
                      ),
                      if (pt.note.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          pt.note,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 9, color: Colors.blueAccent),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showTwinExplanation(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.shield_outlined, color: AppTheme.primary),
                SizedBox(width: 8),
                Text('What is FinPocket Digital Twin?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'Your Digital Twin is a deterministic financial simulation running entirely on your device. '
              'It mirrors your liquid accounts, recurring bills, spending burn rate, and committed goals.\n\n'
              'Unlike generic budgets, the What-If Lab allows you to stress-test financial decisions before you commit '
              'cash, showing the exact impact on your runway and goals with zero guesswork.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Understood', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}
