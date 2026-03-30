import { useState, useCallback } from "react";

export const usePrint = () => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastResult, setLastResult] = useState<PrintResult | null>(null);

  // The actual print function
  // the function takes a file path to the saved image
  // and returns a promise that resolves to the print result
  const print = useCallback(
    async (filePath: string, printerName?: string): Promise<PrintResult> => {
      // setting up the states
      setIsPrinting(true);
      setLastResult(null);

      try {
        // check if running in electron
        if (!window.electronAPI) {
          throw new Error(
            "Print function is only available in the electron environment",
          );
        }

        // trigger print with file path
        const result = await window.electronAPI.print(filePath, printerName);

        // setting up last result state for data caching
        setLastResult(result);

        // returning the result
        return result;
      } catch (error) {
        // if there's an error caught, the execution goes here
        const errorResult = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        setLastResult(errorResult);
        return errorResult;
      } finally {
        // restarting the states
        setIsPrinting(false);
      }
    },
    [],
  );

  // The hook return values
  return {
    print,
    isPrinting,
    lastResult,
  };
};
