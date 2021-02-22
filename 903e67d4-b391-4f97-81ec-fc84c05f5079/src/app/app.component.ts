import { Component, OnInit, ChangeDetectorRef, Input, Output, EventEmitter } from '@angular/core';
import { Class, Student, Absence, Period, Leave } from "./help-class";
import { AppService } from "./app.service";
import * as rx from 'rxjs/Rx';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  selClass: Class;
  currAbs: Absence;
  classes: Class[] = new Array<Class>();
  /**可設定的假別 */
  absences: Absence[] = new Array<Absence>();
  /**全部的假別 */
  allAbsences: Absence[] = new Array<Absence>();
  clearAbs: Absence = new Absence(null, null);
  /**節次 */
  periods: Period[] = new Array<Period>();
  periodMap: Map<string, Period> = new Map<string, Period>();
  periodPermissionMap: Map<string, Period> = new Map<string, Period>();
  students: Student[] = new Array<Student>();
  classSubject$: rx.Subject<Class> = new rx.Subject();
  /**今天該班點名狀態 */
  completed: boolean;
  /**允許跨日設定 */
  canCrossDate = false;

  currentDate: Date = new Date(new Date().toDateString());
  todayDate: Date = new Date(new Date().toDateString());

  quickSelectDate: Date[] = [];

  inputDate: string;

  constructor(private appService: AppService, private change: ChangeDetectorRef) {
  }

  ngOnInit() {
    // 預設值
    this.currAbs = this.clearAbs;
    this.completed = false;
    this.inputDate = this.getDateString(this.currentDate);

    this.quickSelectDate = [];
    [1, 2, 3, 4, 5].forEach(i => {
      var qdate = new Date(this.currentDate);
      qdate.setDate(qdate.getDate() - qdate.getDay() + i);
      this.quickSelectDate.push(qdate);
    });

    // 取得假別、節次、老師帶班
    rx.Observable.combineLatest(
      this.appService.getConfig(),
      this.appService.getAbsences(),
      this.appService.getPeriods(),
      this.appService.getMyClass(), (config, x, y, z) => {
        this.canCrossDate = config.crossDate;
        // 比對設定檔，為 true 的假別才顯示
        if (config.absenceNames.length) {
          const absencesList: Absence[] = [];
          for (const item of x) {
            if (config.absenceNames.indexOf(item.name) !== -1) {
              absencesList.push(item);
            }
          }
          this.absences = absencesList;
        } else {
          this.absences = x;
        }
        this.allAbsences = x;
        this.periods = y;
        y.forEach((p) => {
          p.permission ="一般";
          if (config.periodPermissionMap.size) {            
            config.periodPermissionMap.forEach((item,key) => {
              if(key === p.name)
              {
                p.permission =config.periodPermissionMap.get(key);
              }              
            });
            this.periodMap.set(p.name, p);
          }
          else
          {
            this.periodMap.set(p.name, p);
          }          
        });

        this.periods = this.periods.filter(period => period.permission !== "隱藏");

        this.classes = z;
      })
      .subscribe(() => {
        // 全部取回後，進行處理
        if (this.classes && this.classes.length) {
          // 指定目前班級為第一個班級
          this.selClass = this.classes[0];
          // 訂閱班級異動
          this.classSubject$.subscribe((c) => {
            rx.Observable.combineLatest(
              this.appService.getClassStudentsLeave(c, this.getDateString(this.currentDate), this.absences), this.appService.getRollcallState(c), (studs, complete) => {
                this.students = studs;
                this.completed = complete;
              })
              .subscribe();
          });
          // 切換班級
          this.toggleClassDate();
        }
      });
  }
  getDateString(dateTime: Date): string {
    return dateTime.getFullYear() + "/" + (dateTime.getMonth() + 1) + "/" + dateTime.getDate();
  }

  getDisplayDateString(dateTime: Date): string {
    return (
      (dateTime.getMonth() <= 8 ? "0" : "") + (dateTime.getMonth() + 1)
      + "/" + (dateTime.getDate() <= 9 ? "0" : "") + + dateTime.getDate()
      + " (" + ["日", "一", "二", "三", "四", "五", "六"][dateTime.getDay()] + ")"
    );
  }

  checkDate(input: string) {
    var d = Date.parse(input);
    if (d) {
      this.setCurrentDate(new Date(d));
    }
    else {
      this.inputDate = input;
    }
  }

  setCurrentDate(target: Date, shift?: number) {
    target = new Date(target);
    if (shift) {
      target.setDate(target.getDate() + shift);
    }
    if (this.getDateString(this.currentDate) != this.getDateString(target)) {
      this.currentDate = target;
      this.toggleClassDate();
    }
    this.inputDate = this.getDateString(this.currentDate);

    this.quickSelectDate = [];
    [1, 2, 3, 4, 5].forEach(i => {
      var qdate = new Date(this.currentDate);
      qdate.setDate(qdate.getDate() - qdate.getDay() + i);
      this.quickSelectDate.push(qdate);
    });
  }

  /**切換班級或缺曠日期，取得「該日學生缺曠」、「點名完成」狀態 */
  toggleClassDate(targetClass?: Class) {
    if (targetClass)
      this.selClass = targetClass;
    if (this.selClass) {
      this.classSubject$.next(this.selClass);
    }
  }


  /**假別簡稱 */
  toShort(name: string): string {
    for (let n of this.allAbsences) {
      if (n.name == name) {
        return n.abbreviation;
      }
    }

    return '';
  }

  /**設定全部學生該節次統一假別 */
  setAllStudentsAbs(period: Period) {
    if (period && this.currAbs) {
      this.students.forEach((stu) => {
        if(period.permission ==="一般")
        {
          stu.setAbsence(period.name, this.currAbs.name);
        }        
      });
    }
  }

  /**設定單一學生所有節次統一假別 */
  setStudentAllPeriodAbs(stu) {
    if (stu && this.currAbs) {
      this.periods.forEach((period: Period) => {
        if(period.permission ==="一般")
        {
          stu.setAbsence(period.name, this.currAbs.name);
        }        
      });
    }
  }

  /**設定單一學生單一節次假別 */
  setStudentPeroidAbs(stu, period) {
    if (stu && period && this.currAbs) {
      if (stu.leaveList.has(period.name)) {
        // 與上次相同即清除
        if (stu.leaveList.get(period.name).absName == this.currAbs.name) {
          if(period.permission ==="一般" ||period.permission ==="手動")
          {
            stu.setAbsence(period.name, this.clearAbs.name);
          }          
        }
        else {
          if(period.permission ==="一般" ||period.permission ==="手動")
          {
            stu.setAbsence(period.name, this.currAbs.name);
          }          
        }
      } else {
        if(period.permission ==="一般" ||period.permission ==="手動")
        {
          stu.setAbsence(period.name, this.currAbs.name);
        }        
      }
    }
  }

  /**儲存點名結果 */
  saveData() {
    let data = [];

    this.students.forEach((s) => {
      let tmpDetail: string = '';
      s.leaveList.forEach((value, key) => {
        let periodName = s.leaveList.get(key).periodName;
        let periodType = this.periodMap.get(periodName).type;
        let absName = s.leaveList.get(key).absName;
        tmpDetail += `<Period AbsenceType="${absName}" AttendanceType="${periodType}">${periodName}</Period>`;
      });

      data.push({
        sid: s.sid,
        detail: (tmpDetail) ? `<Attendance>${tmpDetail}</Attendance>` : ''
      });
    });

    this.appService.saveStudentLeave(this.selClass, this.getDateString(this.currentDate), data).subscribe(() => {
      // 重取缺曠狀態
      this.toggleClassDate();
    });
  }

}

