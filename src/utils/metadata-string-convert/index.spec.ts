import { metadataStringConvert } from "./index";

describe("metadataStringConvert", () => {
    it("should return undefined when input is undefined", () => {
        expect(metadataStringConvert(undefined)).toBeUndefined();
    });

    it("should return the same string when input is a string", () => {
        const input = "test string";
        expect(metadataStringConvert(input)).toBe(input);
    });

    it("should join array of strings", () => {
        const input = ["this is ", "a test ", "string"];
        expect(metadataStringConvert(input)).toBe("this is a test string");
    });

    it("should handle empty array", () => {
        expect(metadataStringConvert([])).toBe("");
    });

    it("should handle array with empty strings", () => {
        expect(metadataStringConvert(["", "", ""])).toBe("");
    });

    it("should handle array with single string", () => {
        expect(metadataStringConvert(["single"])).toBe("single");
    });
});
