import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:fl_chart/fl_chart.dart';

void main() {
  runApp(const GoveeDashboardApp());
}

class GoveeDashboardApp extends StatelessWidget {
  const GoveeDashboardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Govee Sensors Dashboard',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        brightness: Brightness.dark,
      ),
      home: const DashboardPage(),
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final Map<String, List<MetricPoint>> temperatureHistory = {};
  final Map<String, List<MetricPoint>> humidityHistory = {};
  final Map<String, double> currentTemperatures = {};
  final Map<String, double> currentHumidity = {};
  final Map<String, double> batteryLevels = {};
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _fetchMetrics();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) => _fetchMetrics());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchMetrics() async {
    try {
      final response = await http.get(Uri.parse('http://localhost:8080/metrics'));
      if (response.statusCode == 200) {
        _parseMetrics(response.body);
      }
    } catch (e) {
      debugPrint('Error fetching metrics: $e');
    }
  }

  void _parseMetrics(String metricsData) {
    final lines = metricsData.split('\n');
    final now = DateTime.now();

    for (final line in lines) {
      if (line.startsWith('#')) continue;
      if (line.isEmpty) continue;

      final parts = line.split(' ');
      if (parts.length < 2) continue;

      final metric = parts[0];
      final value = double.tryParse(parts[1]);
      if (value == null) continue;

      final nameMatch = RegExp(r'name="([^"]+)"').firstMatch(line);
      if (nameMatch == null) continue;
      final name = nameMatch.group(1)!;

      if (metric.startsWith('govee_h5075_temperature')) {
        currentTemperatures[name] = value;
        temperatureHistory.putIfAbsent(name, () => []);
        temperatureHistory[name]!.add(MetricPoint(now, value));
        if (temperatureHistory[name]!.length > 100) {
          temperatureHistory[name]!.removeAt(0);
        }
      } else if (metric.startsWith('govee_h5075_humidity')) {
        currentHumidity[name] = value;
        humidityHistory.putIfAbsent(name, () => []);
        humidityHistory[name]!.add(MetricPoint(now, value));
        if (humidityHistory[name]!.length > 100) {
          humidityHistory[name]!.removeAt(0);
        }
      } else if (metric.startsWith('govee_h5075_battery')) {
        batteryLevels[name] = value;
      }
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Govee Sensors Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchMetrics,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildCurrentReadings(),
            const SizedBox(height: 24),
            _buildCharts(),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentReadings() {
    return Wrap(
      spacing: 16,
      runSpacing: 16,
      children: currentTemperatures.keys.map((name) {
        return SensorCard(
          name: name,
          temperature: currentTemperatures[name] ?? 0,
          humidity: currentHumidity[name] ?? 0,
          battery: batteryLevels[name] ?? 0,
        );
      }).toList(),
    );
  }

  Widget _buildCharts() {
    return Column(
      children: currentTemperatures.keys.map((name) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 24),
          child: SensorCharts(
            name: name,
            temperatureHistory: temperatureHistory[name] ?? [],
            humidityHistory: humidityHistory[name] ?? [],
          ),
        );
      }).toList(),
    );
  }
}

class SensorCard extends StatelessWidget {
  final String name;
  final double temperature;
  final double humidity;
  final double battery;

  const SensorCard({
    super.key,
    required this.name,
    required this.temperature,
    required this.humidity,
    required this.battery,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Container(
        width: 300,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              name,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            _buildMetricRow(Icons.thermostat, '${temperature.toStringAsFixed(1)}°C'),
            const SizedBox(height: 8),
            _buildMetricRow(Icons.water_drop, '${humidity.toStringAsFixed(1)}%'),
            const SizedBox(height: 8),
            _buildBatteryIndicator(),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricRow(IconData icon, String value) {
    return Row(
      children: [
        Icon(icon),
        const SizedBox(width: 8),
        Text(value),
      ],
    );
  }

  Widget _buildBatteryIndicator() {
    return Row(
      children: [
        Icon(battery > 20 ? Icons.battery_full : Icons.battery_alert),
        const SizedBox(width: 8),
        Text('${battery.toStringAsFixed(0)}%'),
      ],
    );
  }
}

class SensorCharts extends StatelessWidget {
  final String name;
  final List<MetricPoint> temperatureHistory;
  final List<MetricPoint> humidityHistory;

  const SensorCharts({
    super.key,
    required this.name,
    required this.temperatureHistory,
    required this.humidityHistory,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$name - History',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 200,
              child: Row(
                children: [
                  Expanded(
                    child: _buildLineChart(
                      temperatureHistory,
                      'Temperature',
                      Colors.red,
                      '°C',
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _buildLineChart(
                      humidityHistory,
                      'Humidity',
                      Colors.blue,
                      '%',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLineChart(
    List<MetricPoint> data,
    String title,
    Color color,
    String unit,
  ) {
    if (data.isEmpty) return const Center(child: Text('No data'));

    return Column(
      children: [
        Text(title),
        const SizedBox(height: 8),
        Expanded(
          child: LineChart(
            LineChartData(
              gridData: FlGridData(show: true),
              titlesData: FlTitlesData(
                rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              borderData: FlBorderData(show: true),
              lineBarsData: [
                LineChartBarData(
                  spots: data.asMap().entries.map((entry) {
                    return FlSpot(
                      entry.key.toDouble(),
                      entry.value.value,
                    );
                  }).toList(),
                  isCurved: true,
                  color: color,
                  barWidth: 2,
                  dotData: FlDotData(show: false),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class MetricPoint {
  final DateTime time;
  final double value;

  MetricPoint(this.time, this.value);
} 