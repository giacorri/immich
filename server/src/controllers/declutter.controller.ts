import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  DeclutterConfirmDto,
  DeclutterGroupDto,
  DeclutterStatusDto,
  DeclutterUpdateGroupDto,
} from 'src/dtos/declutter.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { DeclutterService } from 'src/services/declutter.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Declutter)
@Controller('declutter')
export class DeclutterController {
  constructor(private service: DeclutterService) {}

  @Get('status')
  @Authenticated({ permission: Permission.DeclutterRead })
  @Endpoint({ summary: 'Get declutter status', history: new HistoryBuilder().added('v1').alpha('v1') })
  getDeclutterStatus(@Auth() auth: AuthDto): Promise<DeclutterStatusDto> {
    return this.service.getStatus(auth);
  }

  @Post('run')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.DeclutterRead })
  @Endpoint({ summary: 'Trigger similarity scan', history: new HistoryBuilder().added('v1').alpha('v1') })
  runDeclutter(@Auth() auth: AuthDto): Promise<void> {
    return this.service.runJob(auth);
  }

  @Get('groups')
  @Authenticated({ permission: Permission.DeclutterRead })
  @Endpoint({ summary: 'Get pending similar groups', history: new HistoryBuilder().added('v1').alpha('v1') })
  getDeclutterGroups(@Auth() auth: AuthDto): Promise<DeclutterGroupDto[]> {
    return this.service.getPendingGroups(auth);
  }

  @Patch('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.DeclutterUpdate })
  @Endpoint({ summary: 'Update group status (reviewed/skipped)', history: new HistoryBuilder().added('v1').alpha('v1') })
  updateGroupStatus(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: DeclutterUpdateGroupDto): Promise<void> {
    return this.service.updateGroupStatus(auth, id, dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.DeclutterUpdate })
  @Endpoint({ summary: 'Confirm decisions (trash selected assets)', history: new HistoryBuilder().added('v1').alpha('v1') })
  confirmDecisions(@Auth() auth: AuthDto, @Body() dto: DeclutterConfirmDto): Promise<void> {
    return this.service.confirmDecisions(auth, dto);
  }
}
