import * as vscode from 'vscode';
import { exec, ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import OpenAI from 'openai';

const execAsync = promisify(exec);

interface Segment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
}

export interface Transcription {
  text: string;
  segments: Segment[];
  language: string;
}

export type WhisperModel = 'whisper-1' | 'whisper-large-v3-turbo';

type ApiProvider = 'openai' | 'groq';

interface ApiConfig {
  baseURL: string;
  apiKey: string;
}

const PROVIDER_MODELS: Record<ApiProvider, WhisperModel> = {
  openai: 'whisper-1', // this is default for extension
  groq: 'whisper-large-v3-turbo',
};

class SpeechTranscription {
  private fileName: string = 'recording';
  private recordingProcess: ChildProcess | null = null;
  private tempDir: string;

  constructor(
    private storagePath: string,
    private outputChannel: vscode.OutputChannel,
  ) {
    // Create a temp directory within the storage path
    this.tempDir = path.join(this.storagePath, 'temp');
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private getApiConfig(): ApiConfig {
    const config = vscode.workspace.getConfiguration('speak2script');
    const provider = config.get<ApiProvider>('apiProvider') || 'openai';

    const apiKey = config.get<string>('apiKey');
    if (!apiKey) {
      throw new Error(`API key not configured for ${provider}`);
    }

    const baseURLs: Record<ApiProvider, string> = {
      openai: 'https://api.openai.com/v1',
      groq: 'https://api.groq.com/openai/v1',
    };

    return {
      baseURL: baseURLs[provider],
      apiKey,
    };
  }

  async checkIfInstalled(command: string): Promise<boolean> {
    try {
      await execAsync(`${command} --help`);
      return true;
    } catch (error) {
      return false;
    }
  }

  getOutputDir(): string {
    return this.storagePath;
  }

  startRecording(): void {
    try {
      const outputPath = path.join(this.tempDir, `${this.fileName}.wav`);
      this.recordingProcess = spawn('sox', [
        '-d',
        '-b',
        '16',
        '-e',
        'signed',
        '-c',
        '1',
        '-r',
        '16k',
        outputPath,
      ]);

      if (this.recordingProcess) {
        // Only show initial SoX configuration
        let initialConfigShown = false;

        this.recordingProcess.stderr?.on('data', (data) => {
          const message = data.toString();
          // Only show the initial configuration message
          if (!initialConfigShown && message.includes('Input File')) {
            this.outputChannel.appendLine(
              `Speak 2 Script: SoX Configuration: ${message.trim()}`,
            );
            initialConfigShown = true;
          }
        });

        this.recordingProcess.stdout?.on('data', (data) => {
          this.outputChannel.appendLine(
            `Speak 2 Script: SoX stdout: ${data}`,
          );
        });

        this.recordingProcess.on('close', (code) => {
          if (code !== 0) {
            this.outputChannel.appendLine(
              `Speak 2 Script: SoX process exited with code ${code}`,
            );
          }
        });
      }
    } catch (error) {
      this.outputChannel.appendLine(`Speak 2 Script: error: ${error}`);
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recordingProcess) {
      this.outputChannel.appendLine(
        'Speak 2 Script: No recording process found',
      );
      return;
    }

    this.outputChannel.appendLine('Speak 2 Script: Stopping recording');
    this.recordingProcess.kill('SIGTERM');
    this.recordingProcess = null;
  }

  async transcribeRecording(): Promise<Transcription | undefined> {
    const config = vscode.workspace.getConfiguration('speak2script');
    const provider = config.get<ApiProvider>('apiProvider') || 'openai';

    const apiConfig = this.getApiConfig();

    try {
      this.outputChannel.appendLine(
        `Speak 2 Script: Transcribing recording using ${provider} API`,
      );

      const audioFile = fs.createReadStream(
        path.join(this.tempDir, `${this.fileName}.wav`),
      );

      const model = PROVIDER_MODELS[provider];

      this.outputChannel.appendLine(
        `Speak 2 Script: Using model ${model} for ${provider}`,
      );

      const openai = new OpenAI(apiConfig);

      if (!openai) {
        throw new Error('OpenAI client not initialized');
      }

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: model,
        language: 'ru',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        response_format: 'verbose_json',
      });

      // Convert response to our Transcription interface
      const result: Transcription = {
        text: transcription.text,
        segments:
          transcription.segments?.map((seg) => ({
            id: seg.id,
            seek: 0,
            start: seg.start,
            end: seg.end,
            text: seg.text,
            tokens: [],
            temperature: 0,
          })) ?? [],
        language: transcription.language,
      };

      // Save transcription to storage path
      await fs.promises.writeFile(
        path.join(this.tempDir, `${this.fileName}.json`),
        JSON.stringify(result, null, 2),
      );

      this.outputChannel.appendLine(
        `Speak 2 Script: Transcription: ${result.text}`,
      );

      if (result?.text?.length === 0) {
        return undefined;
      }

      return result;
    } catch (error) {
      // Log the error to output channel
      this.outputChannel.appendLine(
        `Speak 2 Script: error: ${error} (apiConfig.baseURL: ${apiConfig.baseURL})`,
      );

      if (error instanceof Error) {
        // Format the error message to be more user-friendly
        const errorMessage = error.message
          .replace(/\bError\b/i, '') // Remove redundant "Error" word
          .trim();

        vscode.window.showErrorMessage(`Speak 2 Script: ${errorMessage}`);
      }

      return undefined;
    }
  }

  deleteFiles(): void {
    try {
      const wavFile = path.join(this.tempDir, `${this.fileName}.wav`);
      const jsonFile = path.join(this.tempDir, `${this.fileName}.json`);

      if (fs.existsSync(wavFile)) {
        fs.unlinkSync(wavFile);
      }
      if (fs.existsSync(jsonFile)) {
        fs.unlinkSync(jsonFile);
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `Speak 2 Script: Error deleting files: ${error}`,
      );
    }
  }

  // Add cleanup method for extension deactivation
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `Speak 2 Script: Error cleaning up: ${error}`,
      );
    }
  }
}

export default SpeechTranscription;
