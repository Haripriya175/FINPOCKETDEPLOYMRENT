import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../widgets/credit_card_trap_modal.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';

class FinancialPlanningScreen extends StatefulWidget {
  final int initialTabIndex;
  const FinancialPlanningScreen({super.key, this.initialTabIndex = 0});

  @override
  State<FinancialPlanningScreen> createState() => _FinancialPlanningScreenState();
}

class _FinancialPlanningScreenState extends State<FinancialPlanningScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  String? _errorMessage;

  // Loaded Data
  Map<String, dynamic>? _budgetsData;
  Map<String, dynamic>? _forecastData;
  List<dynamic> _calendarEvents = [];
  Map<String, dynamic>? _healthData;
  List<dynamic> _alerts = [];
  List<dynamic> _anomalies = [];
  List<dynamic> _duplicates = [];

  int _forecastDays = 30;
  final _simAmountController = TextEditingController(text: '12000');
  Map<String, dynamic>? _simulationResult;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this, initialIndex: widget.initialTabIndex);
    _loadAllPlanningData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _simAmountController.dispose();
    super.dispose();
  }

  bool _duplicatesUnavailable = false;

  Future<void> _loadAllPlanningData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _duplicatesUnavailable = false;
    });

    try {
      // Primary: Use single aggregated advanced-overview endpoint
      final data = await ApiService.getAdvancedOverview();

      if (mounted) {
        setState(() {
          _budgetsData = data['budgets'] as Map<String, dynamic>? ?? {
            'totalBudget': 0.0,
            'totalSpent': 0.0,
            'remainingTotal': 0.0,
            'overallUtilization': 0,
            'budgets': [],
          };
          _forecastData = data['forecast'] as Map<String, dynamic>? ?? {
            'days': _forecastDays,
            'startingBalance': 0.0,
            'projectedEndingBalance': 0.0,
            'netProjectedCashFlow': 0.0,
            'dailyTimeline': [],
          };
          // `/advanced-overview` returns `calendar` as a List of events, while the
          // individual endpoint wraps them in `{events: [...]}`. Accept both —
          // indexing a List with the String 'events' throws "type 'String' is not
          // a subtype of type 'int' of 'index'".
          final rawCalendar = data['calendar'];
          if (rawCalendar is List) {
            _calendarEvents = rawCalendar;
          } else if (rawCalendar is Map<String, dynamic>) {
            _calendarEvents = (rawCalendar['events'] as List<dynamic>?) ?? const [];
          } else {
            _calendarEvents = const [];
          }
          _healthData = data['financialHealth'] as Map<String, dynamic>? ?? data['health'] as Map<String, dynamic>?;
          _alerts = (data['alerts'] as List<dynamic>?) ?? [];
          _anomalies = (data['anomalies'] as List<dynamic>?) ?? [];
          _duplicates = (data['duplicates'] as List<dynamic>?) ?? [];
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('[FinancialPlanningScreen] Aggregated overview failed, trying individual endpoints: $e');
      // Fallback: Individual endpoint loading with per-tab error isolation
      try {
        final budgetsFuture = ApiService.getBudgetsSummary().catchError((_) => <String, dynamic>{});
        final forecastFuture = ApiService.getCashFlowForecast(days: _forecastDays).catchError((_) => <String, dynamic>{});
        final calendarFuture = ApiService.getFinancialCalendar(filter: 'month').catchError((_) => <dynamic>[]);
        final healthFuture = ApiService.getFinancialHealthIndicators().catchError((_) => <String, dynamic>{});
        final alertsFuture = ApiService.getAlerts().catchError((_) => <dynamic>[]);
        final anomaliesFuture = ApiService.getAnomalies().catchError((_) => <dynamic>[]);
        final duplicatesFuture = ApiService.getDuplicateTransactions().catchError((err) {
          debugPrint('[FinancialPlanningScreen] Duplicates endpoint notice: $err');
          _duplicatesUnavailable = true;
          return <dynamic>[];
        });

        final results = await Future.wait([
          budgetsFuture,
          forecastFuture,
          calendarFuture,
          healthFuture,
          alertsFuture,
          anomaliesFuture,
          duplicatesFuture,
        ]);

        if (mounted) {
          setState(() {
            _budgetsData = results[0] as Map<String, dynamic>;
            _forecastData = results[1] as Map<String, dynamic>;
            _calendarEvents = results[2] as List<dynamic>;
            _healthData = results[3] as Map<String, dynamic>;
            _alerts = results[4] as List<dynamic>;
            _anomalies = results[5] as List<dynamic>;
            _duplicates = results[6] as List<dynamic>;
            _isLoading = false;
          });
        }
      } catch (fallbackErr) {
        if (mounted) {
          setState(() {
            _errorMessage = 'Unable to load financial planning data: $fallbackErr';
            _isLoading = false;
          });
        }
      }
    }
  }

  void _runSimulation() async {
    final amt = double.tryParse(_simAmountController.text) ?? 10000;
    try {
      final sim = await ApiService.simulateFinancialScenario({'additionalExpenseAmount': amt});
      if (mounted) {
        setState(() {
          _simulationResult = sim;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Simulation error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Financial Intelligence & Planning'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: AppTheme.primaryLight,
          labelColor: AppTheme.primaryLight,
          unselectedLabelColor: const Color(0xFF94A3B8),
          tabs: const [
            Tab(text: 'Budgets', icon: Icon(Icons.pie_chart, size: 18)),
            Tab(text: 'Forecast', icon: Icon(Icons.trending_up, size: 18)),
            Tab(text: 'Calendar', icon: Icon(Icons.calendar_month, size: 18)),
            Tab(text: 'Health', icon: Icon(Icons.speed, size: 18)),
            Tab(text: 'Simulator', icon: Icon(Icons.science, size: 18)),
            Tab(text: 'Alerts', icon: Icon(Icons.notifications_active, size: 18)),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, color: Colors.red, size: 48),
                        const SizedBox(height: 12),
                        Text(_errorMessage!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: _loadAllPlanningData,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildBudgetsTab(),
                    _buildForecastTab(),
                    _buildCalendarTab(),
                    _buildHealthTab(),
                    _buildSimulatorTab(),
                    _buildAlertsTab(),
                  ],
                ),
    );
  }

  // 1. Budgets Tab
  Widget _buildBudgetsTab() {
    final budgets = (_budgetsData?['budgets'] as List<dynamic>?) ?? [];
    final totalBudget = (_budgetsData?['totalBudget'] as num?)?.toDouble() ?? 0;
    final totalSpent = (_budgetsData?['totalSpent'] as num?)?.toDouble() ?? 0;
    final remaining = (_budgetsData?['remainingTotal'] as num?)?.toDouble() ?? 0;
    final overallUtil = (_budgetsData?['overallUtilization'] as num?)?.toInt() ?? 0;

    return RefreshIndicator(
      onRefresh: _loadAllPlanningData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Budget Summary Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)]),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('MONTHLY BUDGET UTILIZATION', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: overallUtil > 90 ? const Color(0x26EF4444) : const Color(0x2634D399),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '$overallUtil% Used',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: overallUtil > 90 ? Colors.redAccent : const Color(0xFF34D399)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('₹${totalSpent.toStringAsFixed(0)} / ₹${totalBudget.toStringAsFixed(0)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
                const SizedBox(height: 4),
                Text('Remaining: ₹${remaining.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: totalBudget > 0 ? (totalSpent / totalBudget).clamp(0.0, 1.0) : 0,
                    minHeight: 8,
                    backgroundColor: Colors.white10,
                    valueColor: AlwaysStoppedAnimation(overallUtil > 90 ? Colors.redAccent : AppTheme.primary),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('CATEGORY BUDGETS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
          const SizedBox(height: 8),
          ...budgets.map((b) {
            final cat = b['categoryName'] ?? 'Category';
            final bAmt = (b['budgetAmount'] as num?)?.toDouble() ?? 0;
            final sAmt = (b['spentAmount'] as num?)?.toDouble() ?? 0;
            final util = (b['utilizationPercentage'] as num?)?.toInt() ?? 0;
            final status = b['status'] ?? 'ON_TRACK';
            final statusColor = status == 'OVER_BUDGET'
                ? Colors.red
                : status == 'APPROACHING_LIMIT'
                    ? Colors.amber
                    : const Color(0xFF34D399);

            return Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(cat, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: statusColor)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('₹${sAmt.toStringAsFixed(0)} of ₹${bAmt.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                        Text('$util%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: statusColor)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: bAmt > 0 ? (sAmt / bAmt).clamp(0.0, 1.0) : 0,
                        minHeight: 6,
                        backgroundColor: Colors.white10,
                        valueColor: AlwaysStoppedAnimation(statusColor),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      b['explanation'] ?? '',
                      style: const TextStyle(fontSize: 10, color: Color(0xFF64748B), fontStyle: FontStyle.italic),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  // 2. Forecast Tab
  Widget _buildForecastTab() {
    final startBal = (_forecastData?['startingBalance'] as num?)?.toDouble() ?? 0.0;
    final inflow = (_forecastData?['expectedInflow'] as num?)?.toDouble() ?? 0.0;
    final knownOut = (_forecastData?['knownOutflow'] as num?)?.toDouble() ?? 0.0;
    final estOut = (_forecastData?['estimatedOutflow'] as num?)?.toDouble() ?? 0.0;
    final projectedEnd = (_forecastData?['projectedEndingBalance'] as num?)?.toDouble() ?? 0.0;
    final knownItems = (_forecastData?['knownItems'] as List<dynamic>?) ?? [];

    return RefreshIndicator(
      onRefresh: _loadAllPlanningData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Horizon Toggle
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [7, 30, 90].map((d) {
              final isSel = _forecastDays == d;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  label: Text('$d Days', style: TextStyle(fontSize: 11, color: isSel ? Colors.black : Colors.white)),
                  selected: isSel,
                  selectedColor: AppTheme.primary,
                  onSelected: (val) {
                    if (val) {
                      setState(() => _forecastDays = d);
                      _loadAllPlanningData();
                    }
                  },
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),

          // Forecast Summary Box
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)]),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              children: [
                const Text('PROJECTED ENDING BALANCE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
                const SizedBox(height: 6),
                Text('₹${projectedEnd.toStringAsFixed(0)}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Color(0xFF34D399))),
                const SizedBox(height: 12),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Starting Balance', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                    Text('₹${startBal.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Expected Inflows (Salary)', style: TextStyle(fontSize: 12, color: Color(0xFF34D399))),
                    Text('+₹${inflow.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF34D399))),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Known Outflows (Bills & EMIs)', style: TextStyle(fontSize: 12, color: Colors.orangeAccent)),
                    Text('-₹${knownOut.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.orangeAccent)),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Estimated Outflows (Daily Burn)', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                    Text('-₹${estOut.toStringAsFixed(0)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('KNOWN SCHEDULED ITEMS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
          const SizedBox(height: 8),
          ...knownItems.map((item) {
            final isInc = item['type'] == 'INCOME';
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: isInc ? const Color(0x2634D399) : const Color(0x26F59E0B),
                  child: Icon(isInc ? Icons.arrow_downward : Icons.receipt, color: isInc ? const Color(0xFF34D399) : Colors.orangeAccent, size: 18),
                ),
                title: Text(item['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                subtitle: Text('Due: ${item['dueDate']} • KNOWN', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                trailing: Text(
                  '${isInc ? '+' : '-'}₹${(item['amount'] as num?)?.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: isInc ? const Color(0xFF34D399) : null),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  // 3. Calendar Tab
  Widget _buildCalendarTab() {
    return RefreshIndicator(
      onRefresh: _loadAllPlanningData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _calendarEvents.length,
        itemBuilder: (ctx, idx) {
          final e = _calendarEvents[idx];
          final isInc = e['type'] == 'INCOME';
          final status = e['status'] ?? 'SCHEDULED';
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isInc ? const Color(0x2634D399) : const Color(0x263B82F6),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  (e['date'] as String?)?.split('-').sublist(1).join('/') ?? '',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: isInc ? const Color(0xFF34D399) : AppTheme.primaryLight),
                ),
              ),
              title: Text(e['title'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              subtitle: Text('${e['type']} • ${e['source']}', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${isInc ? '+' : '-'}₹${(e['amount'] as num?)?.toStringAsFixed(0)}',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: isInc ? const Color(0xFF34D399) : null),
                  ),
                  Text(status, style: const TextStyle(fontSize: 9, color: Color(0xFF64748B))),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // 4. Health Tab
  Widget _buildHealthTab() {
    final indicators = (_healthData?['indicators'] as List<dynamic>?) ?? [];
    return RefreshIndicator(
      onRefresh: _loadAllPlanningData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white12),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: AppTheme.primaryLight, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'All 8 indicators are evaluated deterministically from active records without arbitrary scoring.',
                    style: TextStyle(fontSize: 11, color: Color(0xFFCBD5E1)),
                  ),
                ),
              ],
            ),
          ),
          ...indicators.map((ind) {
            final status = ind['status'] ?? 'GOOD';
            final statusColor = status == 'OPTIMAL'
                ? const Color(0xFF34D399)
                : status == 'GOOD'
                    ? AppTheme.primaryLight
                    : status == 'FAIR'
                        ? Colors.amber
                        : Colors.redAccent;

            return Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(ind['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: statusColor)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(ind['currentValue'] ?? '', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: statusColor)),
                        Text('Target: ${ind['baseline']}', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(ind['explanation'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  // 5. Simulator Tab
  Widget _buildSimulatorTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('WHAT-IF FINANCIAL SIMULATOR', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
                const SizedBox(height: 4),
                const Text('Test how a large purchase or savings change impacts your future Safe-to-Spend buffer.', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                const SizedBox(height: 12),
                TextField(
                  controller: _simAmountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Simulated Purchase Amount (₹)',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: _runSimulation,
                  icon: const Icon(Icons.play_arrow),
                  label: const Text('Simulate Financial Impact'),
                  style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                ),
              ],
            ),
          ),
        ),
        if (_simulationResult != null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('SIMULATION RESULTS (READ-ONLY)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryLight)),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Projected Ending Balance', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                    Text('₹${(_simulationResult!['projectedBalance'] as num?)?.toStringAsFixed(0)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Projected Safe-to-Spend', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                    Text('₹${(_simulationResult!['projectedSafeToSpend'] as num?)?.toStringAsFixed(0)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF34D399))),
                  ],
                ),
                const SizedBox(height: 10),
                Text(_simulationResult!['explanation'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFFCBD5E1), fontStyle: FontStyle.italic)),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // 6. Alerts Tab
  Widget _buildAlertsTab() {
    return RefreshIndicator(
      onRefresh: _loadAllPlanningData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Credit Card Minimum Due Trap Buster
          Consumer<AppState>(
            builder: (ctx, state, _) {
              if (state.creditCardStatements.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Text('💳', style: TextStyle(fontSize: 14)),
                      SizedBox(width: 6),
                      Text(
                        'CREDIT CARD "MINIMUM DUE TRAP" BUSTER',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFEF4444)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ...state.creditCardStatements.map((stmt) {
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide(
                          color: stmt.isPaid ? const Color(0xFF10B981) : const Color(0xFFEF4444).withOpacity(0.4),
                        ),
                      ),
                      child: InkWell(
                        onTap: () => CreditCardTrapModal.show(context, stmt),
                        borderRadius: BorderRadius.circular(14),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    '${stmt.bankName} (•••• ${stmt.cardLast4})',
                                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: stmt.isPaid ? const Color(0xFF10B981).withOpacity(0.15) : const Color(0xFFEF4444).withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      stmt.isPaid ? 'PAID ✅' : 'DUE IN ${stmt.daysRemaining} DAYS',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: stmt.isPaid ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text('Total Amount Due', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                        Text('₹${stmt.totalAmountDue.toStringAsFixed(0)}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text('Minimum Due (Trap)', style: TextStyle(fontSize: 11, color: Color(0xFFEF4444))),
                                        Text('₹${stmt.minimumAmountDue.toStringAsFixed(0)}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFEF4444))),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              if (!stmt.isPaid) ...[
                                const SizedBox(height: 8),
                                Text(
                                  '🚨 Paying Min Due incurs ~₹${stmt.trapInterestCost.toStringAsFixed(0)} in 42% APR interest! Tap to bust trap.',
                                  style: const TextStyle(fontSize: 11, color: Color(0xFFFCA5A5), fontStyle: FontStyle.italic),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 12),
                ],
              );
            },
          ),
          const Text('ACTIVE FINANCIAL ALERTS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
          const SizedBox(height: 8),
          if (_alerts.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: Text('No active alerts.', style: TextStyle(color: Color(0xFF94A3B8)))),
            ),
          ..._alerts.map((a) {
            final isCritical = a['severity'] == 'CRITICAL';
            final isWarning = a['severity'] == 'WARNING';
            final iconColor = isCritical ? Colors.red : isWarning ? Colors.amber : AppTheme.primaryLight;

            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: iconColor.withOpacity(0.2),
                  child: Icon(Icons.notifications, color: iconColor, size: 18),
                ),
                title: Text(a['title'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                subtitle: Text(a['explanation'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              ),
            );
          }),
          if (_duplicatesUnavailable)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0x1AEF4444),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.redAccent.withOpacity(0.3)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.amber, size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Duplicate transaction analysis is temporarily unavailable.',
                      style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                    ),
                  ),
                ],
              ),
            )
          else if (_anomalies.isEmpty && _duplicates.isEmpty)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'No unusual spending anomalies or duplicate transactions detected.',
                style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            ),
          ..._anomalies.map((anom) {
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0x26F59E0B),
                  child: Icon(Icons.warning_amber, color: Colors.amber, size: 18),
                ),
                title: Text('Unusual ${anom['category']} Spending', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                subtitle: Text(anom['explanation'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              ),
            );
          }),
          ..._duplicates.map((dup) {
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0x263B82F6),
                  child: Icon(Icons.copy, color: AppTheme.primaryLight, size: 18),
                ),
                title: Text('Possible Duplicate: ${dup['merchant']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                subtitle: Text(dup['explanation'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              ),
            );
          }),
        ],
      ),
    );
  }
}
