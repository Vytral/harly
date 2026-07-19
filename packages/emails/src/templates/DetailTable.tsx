/**
 * DetailTable — shared key/value panel used by InterviewScheduled,
 * InterviewRescheduled and OfferExtended. Rendered as a sage-washed band
 * (the evergreen accent made visible) with sage-ink labels and ink values,
 * separated by hairlines. Tailwind classes come from the shared
 * harlyTailwindConfig theme; the table wrapper is inline-styled because
 * <table> is not a React Email component.
 */
type Row = { label: string; value: string };

type DetailTableProps = {
  rows: Row[];
};

export function DetailTable({ rows }: DetailTableProps) {
  return (
    <table
      style={{
        backgroundColor: "#eaf6c8",
        borderRadius: "12px",
        margin: "4px 0 24px",
        padding: "4px 22px",
        width: "100%",
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: "0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {rows.map((row, index) => {
                  const isLast = index === rows.length - 1;
                  return (
                    <tr
                      key={row.label}
                      style={{
                        borderBottom: isLast ? "0" : "1px solid rgba(68,82,15,0.12)",
                      }}
                    >
                      <td
                        style={{
                          color: "#44520f",
                          fontSize: "13px",
                          fontWeight: 500,
                          padding: "14px 0",
                          verticalAlign: "top",
                          width: "38%",
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{
                          color: "#171717",
                          fontSize: "14px",
                          fontWeight: 600,
                          padding: "14px 0",
                          textAlign: "left",
                        }}
                      >
                        {row.value}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
