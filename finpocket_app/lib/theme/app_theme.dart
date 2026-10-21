import 'package:flutter/material.dart';

class AppTheme {
  // Brand Colors (from Web style.css & dashboard.css)
  static const Color primary = Color(0xFF14B8A6); // Teal #14b8a6
  static const Color primaryDark = Color(0xFF0D9488); // #0d9488
  static const Color primaryLight = Color(0xFF5EEAD4); // #5eead4
  static const Color primaryGlow = Color(0x4D14B8A6); // rgba(20, 184, 166, 0.3)
  static const Color accentBlue = Color(0xFF0EA5E9); // #0ea5e9
  static const Color accentPurple = Color(0xFF8B5CF6); // #8b5cf6

  // Dark Theme Colors
  static const Color bgDark = Color(0xFF0F172A); // --bg-dark #0f172a
  static const Color bgSurfaceDark = Color(0xFF162032); // --bg-surface #162032
  static const Color bgCardDark = Color(0xFF1E293B); // --bg-card #1e293b
  static const Color bgCardDarkHover = Color(0xFF273548); // --bg-card-hover #273548
  static const Color bgInputDark = Color(0xFF1E293B); // --bg-input #1e293b

  // Light Theme Colors
  static const Color bgLight = Color(0xFFF5F7FB); // --fp-bg #f5f7fb
  static const Color bgSurfaceLight = Color(0xFFFFFFFF); // --fp-card #ffffff
  static const Color bgCardLight = Color(0xFFFFFFFF);
  static const Color bgCardLightSoft = Color(0xFFF8FAFC); // --fp-card-soft #f8fafc

  // Text Colors
  static const Color textPrimaryDark = Color(0xFFF1F5F9); // --text-primary #f1f5f9
  static const Color textSecondaryDark = Color(0xFF94A3B8); // --text-secondary #94a3b8
  static const Color textMutedDark = Color(0xFF64748B); // --text-muted #64748b

  static const Color textPrimaryLight = Color(0xFF172033); // --fp-text #172033
  static const Color textSecondaryLight = Color(0xFF64748B); // --fp-muted #64748b
  static const Color textMutedLight = Color(0xFF94A3B8);

  // Status & Semantic Colors
  static const Color success = Color(0xFF22C55E); // --success #22c55e (Income)
  static const Color warning = Color(0xFFF59E0B); // --warning #f59e0b
  static const Color danger = Color(0xFFEF4444); // --danger #ef4444 (Expense)
  static const Color info = Color(0xFF3B82F6); // --info #3b82f6 (Budget)
  static const Color accentGreen = success;
  static const Color accentRed = danger;

  // Borders
  static const Color borderDark = Color(0x1F94A3B8); // rgba(148, 163, 184, 0.12)
  static const Color borderLight = Color(0x1A0F172A); // rgba(15, 23, 42, 0.10)

  // Gradients
  static const LinearGradient gradientPrimary = LinearGradient(
    colors: [Color(0xFF14B8A6), Color(0xFF0EA5E9)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient gradientCardDark = LinearGradient(
    colors: [Color(0xCC1E293B), Color(0xE60F172A)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient gradientHeroDark = LinearGradient(
    colors: [Color(0xFF0F172A), Color(0xFF1A2744), Color(0xFF0F172A)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: primary,
      scaffoldBackgroundColor: bgDark,
      colorScheme: const ColorScheme.dark(
        primary: primary,
        secondary: accentBlue,
        surface: bgSurfaceDark,
        onSurface: textPrimaryDark,
      ),
      cardTheme: CardThemeData(
        color: bgCardDark,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: borderDark),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgDark,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: textPrimaryDark),
        titleTextStyle: TextStyle(
          color: textPrimaryDark,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: bgSurfaceDark,
        selectedItemColor: primary,
        unselectedItemColor: textSecondaryDark,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
    );
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: primary,
      scaffoldBackgroundColor: bgLight,
      colorScheme: const ColorScheme.light(
        primary: primary,
        secondary: accentBlue,
        surface: bgSurfaceLight,
        onSurface: textPrimaryLight,
      ),
      cardTheme: CardThemeData(
        color: bgCardLight,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: borderLight),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgLight,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: textPrimaryLight),
        titleTextStyle: TextStyle(
          color: textPrimaryLight,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: bgSurfaceLight,
        selectedItemColor: primary,
        unselectedItemColor: textSecondaryLight,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
    );
  }

  static BoxDecoration cardDecoration(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return BoxDecoration(
      color: isDark ? bgCardDark : bgCardLight,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: isDark ? borderDark : borderLight),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
          blurRadius: 10,
          offset: const Offset(0, 4),
        ),
      ],
    );
  }
}
