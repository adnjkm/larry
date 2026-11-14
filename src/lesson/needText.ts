/** "It must carry ink out to the paper" becomes "Carry ink out to the paper", for places that already say "It must". */
export const needText = (need: string): string => {
  const rest = need.replace(/^it must\s+/i, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};
