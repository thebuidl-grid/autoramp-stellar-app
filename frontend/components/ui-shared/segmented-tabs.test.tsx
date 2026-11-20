import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SegmentedTabs, TabPanel } from "./segmented-tabs";

afterEach(cleanup);

const TABS = [
  { value: "all", label: "All", count: 1204 },
  { value: "onramp", label: "Onramp", count: 0 },
  { value: "logs", label: "Transfer logs" },
];

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("all");
  return (
    <>
      <SegmentedTabs
        tabs={TABS}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
        label="Transaction type"
      />
      <TabPanel value="all" current={value}>
        all body
      </TabPanel>
      <TabPanel value="logs" current={value}>
        logs body
      </TabPanel>
    </>
  );
}

describe("<SegmentedTabs />", () => {
  it("is a labelled tablist with one selected tab and counts only where known", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Transaction type" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveTextContent("1,204");
    expect(screen.getByRole("tab", { name: /^Onramp/ })).toHaveTextContent("0"); // a real zero is shown
    expect(screen.getByRole("tab", { name: "Transfer logs" })).not.toHaveTextContent(/\d/); // unknown is not shown as 0
  });

  it("only the selected tab is in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /^Onramp/ })).toHaveAttribute("tabindex", "-1");
  });

  it("switches on click and shows only the matching panel, labelled by its tab", async () => {
    render(<Harness />);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("all body");
    await userEvent.click(screen.getByRole("tab", { name: "Transfer logs" }));
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("logs body");
    expect(panel).toHaveAttribute("aria-labelledby", screen.getByRole("tab", { name: "Transfer logs" }).id);
    expect(screen.queryByText("all body")).not.toBeInTheDocument();
  });

  it("moves with the arrow keys, wraps around, and jumps with Home and End, moving focus too", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole("tab", { name: /^All/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /^Onramp/ })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Transfer logs" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveFocus(); // wraps
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Transfer logs" })).toHaveFocus(); // wraps back
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveFocus();
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["onramp", "logs", "all", "logs", "all"]);
  });
});
