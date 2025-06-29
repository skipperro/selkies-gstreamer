import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const ShortcutsMenu = () => {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-accent group">
					<ChevronLeft className="h-4 w-4 mr-2 flex-shrink-0" />
					<span className="text-left break-words whitespace-normal flex-1">Shortcuts</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="left" align="start" className="w-auto p-4 bg-background/95 backdrop-blur-sm border shadow-sm">
				<small className="text-foreground">
					Shortcuts
					<ul className="list-disc pl-5 text-foreground">
						<li>Fullscreen: Ctrl + Shift + F or Fullscreen Button</li>
						<li>Remote (Game) Cursor Lock: Ctrl + Shift + LeftClick</li>
						<li>Open Side Menu: Ctrl + Shift + M or Side Button</li>
						<li>Toggle Gamepad: Ctrl + Shift + G or Gamepad Button</li>
						<li>
							<a
								className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
								target="_blank"
								rel="noopener noreferrer"
								href="https://github.com/selkies-project/selkies/blob/main/docs/README.md#citations-in-academic-publications"
							>
								<b>Please cite within your publication for academic usage</b>
							</a>
						</li>
					</ul>
				</small>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default ShortcutsMenu;