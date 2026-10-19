// Links become numbered citations, listed in a References section at the end.
export class CitationRegistry {
  private numbers = new Map<string, number>();
  private labels = new Map<string, string>();

  // The link's number, the same each time it is cited.
  cite(href: string, label: string): number {
    let num = this.numbers.get(href);
    if (num == null) {
      num = this.numbers.size + 1;
      this.numbers.set(href, num);
    }
    if (label) this.labels.set(href, label);
    return num;
  }

  // The cited links that have a label, in citation order.
  references(): Array<{ href: string; label: string; num: number }> {
    return Array.from(this.labels, ([href, label]) => ({ href, label, num: this.numbers.get(href)! })).sort(
      (a, b) => a.num - b.num,
    );
  }
}
