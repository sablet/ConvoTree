#!/usr/bin/env python3
"""Analyze domain distribution in goal extraction CSV files."""

import csv
import json
from collections import Counter
from pathlib import Path


def main():
    """Analyze domain distribution across all cluster goal files."""
    output_dir = Path("output/goal_extraction/processed")
    csv_files = sorted(output_dir.glob("cluster_*_goals.csv"))

    if not csv_files:
        print("No CSV files found in output/goal_extraction/processed/")
        return

    print(f"Found {len(csv_files)} CSV files")
    print()

    # Counters
    total_items = 0
    items_with_domain = 0
    domain_counter = Counter()

    for csv_file in csv_files:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_items += 1
                domain_str = row.get('domain', '[]')

                try:
                    domains = json.loads(domain_str)
                    if domains:  # Non-empty list
                        items_with_domain += 1
                        for domain in domains:
                            domain_counter[domain] += 1
                except json.JSONDecodeError:
                    print(f"Warning: Could not parse domain in {csv_file.name}: {domain_str}")
                    continue

    # Calculate statistics
    if total_items == 0:
        print("No items found")
        return

    ratio_with_domain = items_with_domain / total_items * 100

    print("=" * 60)
    print("Domain Distribution Analysis")
    print("=" * 60)
    print()
    print(f"Total items: {total_items}")
    print(f"Items with domain: {items_with_domain} ({ratio_with_domain:.1f}%)")
    print(f"Items without domain: {total_items - items_with_domain} ({100 - ratio_with_domain:.1f}%)")
    print()

    if domain_counter:
        print("Domain occurrence count (one item can have multiple domains):")
        print("-" * 60)
        for domain, count in domain_counter.most_common():
            percentage = count / total_items * 100
            print(f"  {domain:20s}: {count:4d} ({percentage:5.1f}% of total items)")
        print()
        print(f"Total domain occurrences: {sum(domain_counter.values())}")
        print(f"Average domains per item: {sum(domain_counter.values()) / total_items:.2f}")


if __name__ == "__main__":
    main()
