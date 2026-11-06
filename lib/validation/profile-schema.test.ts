import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile-schema";

describe("profileSchema", () => {
  it("trims editable values and clears a blank phone", () => {
    expect(profileSchema.parse({ displayName: "  Ada Lovelace  ", phone: "  " })).toEqual({ displayName: "Ada Lovelace", phone: null });
    expect(profileSchema.parse({ displayName: "Ada", phone: " +1234567890 " }).phone).toBe("+1234567890");
  });
  it.each(["", "   ", "a".repeat(151), "Ada\nLovelace", "Ada\t", "Ada\u007f"])('rejects invalid display name %j', (displayName) => {
    expect(profileSchema.safeParse({ displayName, phone: "" }).success).toBe(false);
  });
  it.each(["123456", "1234567890123456", "+", "123-4567", "123 4567", "１２３４５６７", "++1234567"])('rejects invalid phone %j', (phone) => {
    expect(profileSchema.safeParse({ displayName: "Ada", phone }).success).toBe(false);
  });
  it.each(["1234567", "+123456789012345"])('accepts phone boundary %j', (phone) => {
    expect(profileSchema.safeParse({ displayName: "a".repeat(150), phone }).success).toBe(true);
  });
});
