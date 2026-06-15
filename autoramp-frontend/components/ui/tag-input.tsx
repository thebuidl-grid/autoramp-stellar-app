import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface TagInputProps {
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
}

export function TagInput({ value, onChange, placeholder }: TagInputProps) {
    const [inputValue, setInputValue] = useState("");

    const tags = value ? value.split(",").filter(Boolean) : [];

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const val = inputValue.trim();
            if (val) {
                if (!tags.includes(val)) {
                    onChange([...tags, val].join(","));
                }
                setInputValue("");
            }
        }
    };

    const removeTag = (indexToRemove: number) => {
        const newTags = tags.filter((_, i) => i !== indexToRemove);
        onChange(newTags.join(","));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="bg-primary/20 text-primary border-primary/20 hover:bg-primary/30">
                        {tag.trim()}
                        <button
                            type="button"
                            onClick={() => removeTag(index)}
                            className="ml-2 hover:text-white"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
            </div>
            <Input
                placeholder={placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-zinc-900/50 border-zinc-700 text-white"
            />
        </div>
    );
}
