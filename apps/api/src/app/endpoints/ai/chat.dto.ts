import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  systemPrompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  toolNames?: string[];
}
