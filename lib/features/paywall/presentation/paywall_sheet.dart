import 'package:flutter/material.dart';
import 'paywall_content.dart';

/// The Free Tier conversion gate - shown as a partial-height, draggable
/// bottom sheet over whatever screen the person just tapped into, so the
/// destination is still visible/scrollable behind it ("slide/swipe through
/// the core dashboard services located underneath the paywall block to
/// preview available services" per the paywall spec). Swiping it down or
/// tapping the X dismisses it without blocking navigation.
Future<void> showPaywallSheet(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (sheetContext) => FractionallySizedBox(
      heightFactor: 0.9,
      child: SafeArea(
        top: false,
        child: PaywallContent(onContinueFree: () => Navigator.of(sheetContext).pop()),
      ),
    ),
  );
}
