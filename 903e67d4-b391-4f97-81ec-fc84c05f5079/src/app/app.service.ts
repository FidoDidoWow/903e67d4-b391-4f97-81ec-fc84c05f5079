import { Injectable, NgZone } from '@angular/core';
import { Class, Student, Absence, Period, Leave, Config } from './help-class';
import * as Rx from "rxjs/Rx";

type SendOptions = { contact: string, service: string, body: any, map: (rsp) => any };

@Injectable()
export class AppService {

  // p.kcbs.hc.edu.tw

  constructor(private zone: NgZone) { }

  /**呼叫 gadget service */
  private send(opts: SendOptions): Rx.Observable<any> {
    return Rx.Observable.create((subj$) => {
      let connection = gadget.getContract(opts.contact);
      connection.send({
        service: opts.service,
        body: opts.body,
        result: (response, error) => {
          if (error !== null) {
            subj$.error(error);
          } else {
            this.zone.run(() => {
              subj$.next(opts.map(response));
              subj$.complete();
            });
          }
        }
      });
    });
  }

  /**取得老師帶班 */
  getMyClass(): Rx.Observable<Class[]> {

    return this.send({
      contact: "cloud.teacher",
      service: "beta.GetMyClass",
      body: "",
      map: (rsp) => {
        let classes = new Array<Class>();
        if (rsp.Class) {
          rsp.Class = [].concat(rsp.Class || []);
          rsp.Class.forEach((item) => {
            classes.push(new Class(item.ClassId, item.ClassName, item.GradeYear));
          });
        }
        return classes;
      }
    }) as Rx.Observable<Class[]>;
  }

  /**取得節次 */
  getPeriods(): Rx.Observable<Period[]> {

    return this.send({
      contact: "cloud.public",
      service: "beta.GetSystemConfig",
      body: { Name: '節次對照表' },
      map: (rsp) => {
        let periods = new Array<Period>();
        if (rsp.List && rsp.List.Content && rsp.List.Content.Periods && rsp.List.Content.Periods.Period) {
          rsp.List.Content.Periods.Period = [].concat(rsp.List.Content.Periods.Period || []);
          rsp.List.Content.Periods.Period.forEach((item) => {
            periods.push(new Period(item.Name, Number(item.Sort), item.Type, ""));
          });
          // 排序
          periods.sort((a, b) => {
            if (a.sort > b.sort) {
              return 1;
            }
            if (a.sort < b.sort) {
              return -1;
            }
            return 0;
          });
        }
        return periods;
      }
    }) as Rx.Observable<Period[]>;
  }

  /**取得假別 */
  getAbsences(): Rx.Observable<Absence[]> {

    return this.send({
      contact: "cloud.public",
      service: "beta.GetSystemConfig",
      body: { Name: '假別對照表' },
      map: (rsp) => {
        let absences = new Array<Absence>();
        if (rsp.List && rsp.List.Content && rsp.List.Content.AbsenceList && rsp.List.Content.AbsenceList.Absence) {
          rsp.List.Content.AbsenceList.Absence = [].concat(rsp.List.Content.AbsenceList.Absence || []);
          rsp.List.Content.AbsenceList.Absence.forEach((item) => {
            absences.push(new Absence(item.Name, item.Abbreviation));
          });
        }
        return absences;
      }
    }) as Rx.Observable<Absence[]>;
  }

  /**取得今天某班級點名狀態 */
  getRollcallState(selClass: Class): Rx.Observable<boolean> {

    return this.send({
      contact: "p_kcbs.rollCallBook.teacher",
      service: "_.checkTodayRollCall",
      body: { classId: selClass.classId },
      map: (rsp) => {
        return rsp.completed;
      }
    }) as Rx.Observable<boolean>;
  }

  /**取得班級學生及今天請假狀態 */
  getClassStudentsLeave(selClass: Class, occurDate: string, absences: Absence[]): Rx.Observable<Student[]> {
    const aryAbsence: string[] = [];
    for (const item of absences) { aryAbsence.push(item.name); }

    return this.send({
      contact: "p_kcbs.rollCallBook.teacher",
      service: "_.getStudentAttendance",
      body: { classId: selClass.classId, OccurDate: occurDate },
      map: (rsp) => {
        const students = new Array<Student>();
        if (rsp.Student) {
          const stus = [].concat(rsp.Student || []);
          stus.forEach((item) => {
            const leaves: Map<string, Leave> = new Map<string, Leave>();
            const orileaves: Map<string, Leave> = new Map<string, Leave>();
            if (item.Detail && item.Detail.Attendance && item.Detail.Attendance.Period) {
              const periods: any = [].concat(item.Detail.Attendance.Period || []);
              periods.forEach((p) => {

                const isLock = (aryAbsence.indexOf(p.AbsenceType) !== -1) ? false : true;
                leaves.set(p['@text'], new Leave(p['@text'], p.AbsenceType, isLock));
                orileaves.set(p['@text'], new Leave(p['@text'], p.AbsenceType, isLock));
              });
            }
            students.push(new Student(item.StudentId, item.StudentName, item.SeatNo, leaves, orileaves, []));
          });
        }
        return students;
      }
    }) as Rx.Observable<Student[]>;
  }

  /**儲存學生請假狀況 */
  saveStudentLeave(selClass, occurDate, data) {

    return this.send({
      contact: "p_kcbs.rollCallBook.teacher",
      service: "_.setStudentAttendance",
      body: {
        classId: selClass.classId,
        OccurDate: occurDate,
        students: { student: data }
      },
      map: (rsp) => {
        return rsp.complete;
      }
    }) as Rx.Observable<boolean>;
  }

  /**取得班導師點名設定 */
  getConfig(): Rx.Observable<Config> {

    return this.send({
      contact: "cloud.public",
      service: "beta.GetSystemConfig",
      body: { Name: '班導師點名設定' },
      map: (rsp) => {
        const absenceNames = new Array<string>();

        const periodPermissionMap: Map<string, string> = new Map<string, string>();

        const checkAbsenceNames = new Array<string>();;

        let crossDate = false;

        // 可設定的假別
        if (rsp.List && rsp.List.Content && rsp.List.Content.AbsenceList && rsp.List.Content.AbsenceList.Absence) {
          rsp.List.Content.AbsenceList.Absence = [].concat(rsp.List.Content.AbsenceList.Absence || []);
          rsp.List.Content.AbsenceList.Absence.forEach((item) => {
            if (item['@text'] === 'True') {
              absenceNames.push(item.Name);
            }
          });
        }

        // 可設定的節次
        if (rsp.List && rsp.List.Content && rsp.List.Content.PeriodList && rsp.List.Content.PeriodList.Period) {
          rsp.List.Content.PeriodList.Period = [].concat(rsp.List.Content.PeriodList.Period || []);
          rsp.List.Content.PeriodList.Period.forEach((item) => {
            if (item['@text'] === '一般') {
              periodPermissionMap.set(item.Name, "一般");
            }
            if (item['@text'] === '手動') {
              periodPermissionMap.set(item.Name, "手動");
            }
            if (item['@text'] === '唯讀') {
              periodPermissionMap.set(item.Name, "唯讀");
            }
            if (item['@text'] === '隱藏') {
              periodPermissionMap.set(item.Name, "隱藏");
            }
          });
        }

        // 需要確認檢查的 連續缺曠類別
        if (rsp.List && rsp.List.Content && rsp.List.Content.CheckAbsenceList && rsp.List.Content.CheckAbsenceList.Absence) {
          rsp.List.Content.CheckAbsenceList.Absence = [].concat(rsp.List.Content.CheckAbsenceList.Absence || []);
          rsp.List.Content.CheckAbsenceList.Absence.forEach((item) => {
            if (item['@text'] === 'True') {
              checkAbsenceNames.push(item.Name);
            }
          });
        }

        if (rsp.List && rsp.List.Content && rsp.List.Content.AbsenceList && rsp.List.Content.AbsenceList.CrossDate) {
          crossDate = (rsp.List.Content.AbsenceList.CrossDate === 'True');
        }
        return {
          absenceNames: absenceNames,
          periodPermissionMap: periodPermissionMap,
          crossDate: crossDate,
          checkAbsenceNames: checkAbsenceNames
        };
      }
    }) as Rx.Observable<Config>;
  }

}
