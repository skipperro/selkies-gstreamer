import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Clipboard() {
	const [dashboardClipboardContent, setDashboardClipboardContent] = useState('');

	const handleClipboardChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setDashboardClipboardContent(event.target.value);
	};

	const handleClipboardBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
		window.postMessage({ type: 'clipboardUpdateFromUI', text: event.target.value }, window.location.origin);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="w-full justify-start">
					<ChevronLeft className="mr-2 h-4 w-4" />
					Clipboard
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="left" align="start" className="w-[300px] p-4 flex flex-col gap-2">
				<Label htmlFor="dashboardClipboardTextarea">Clipboard</Label>
				<Textarea
					id="dashboardClipboardTextarea"
					value={dashboardClipboardContent}
					onChange={handleClipboardChange}
					onBlur={handleClipboardBlur}
					rows={5}
					placeholder="Enter text to copy to remote clipboard..."
					className="allow-native-input resize-none bg-background/95 overflow-y-auto max-h-[150px]"
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
