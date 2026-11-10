/** Rules for verified-buyer product reviews. */

type Scored = { usefulness: number; clarity: number; listing_accuracy: number };

/** A review's overall rating is the average of its three scores, to one decimal. */
export function reviewOverall(r: Scored) {
  return Math.round(((r.usefulness + r.clarity + r.listing_accuracy) / 3) * 10) / 10;
}

/** How many reviews round to each star level, 5 down to 1. */
export function ratingBreakdown(reviews: Scored[]) {
  return [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => Math.round(reviewOverall(r)) === stars).length,
  }));
}
